#!/usr/bin/env node

/**
 * Zotero MCP Server
 *
 * An MCP (Model Context Protocol) server that exposes Zotero library
 * management tools via the Zotero Web API v3.
 *
 * Tools:
 *   - list_collections      — List collections with pagination
 *   - create_collection      — Create a new collection
 *   - create_note            — Create a standalone note (with optional template)
 *   - add_note_to_collection — Add an existing item to a collection
 *   - search_items           — Search items by title, creator, year, or full text
 *   - get_item_attachments   — List attachments for an item (local path detection)
 *   - get_item_fulltext      — Get full-text content (local-first, API fallback)
 *   - read_attachment        — Read attachment file (local path or base64 download)
 *
 * Environment variables (required):
 *   ZOTERO_API_KEY      — Zotero API key
 *   ZOTERO_LIBRARY_ID   — Zotero user library ID
 *
 * Environment variables (optional):
 *   ZOTERO_DATA_DIR     — Local Zotero data directory (default: ~/Zotero)
 *
 * @see https://www.zotero.org/support/dev/web_api/v3/basics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ZoteroClient } from "./zotero-api.js";
import type { AttachmentInfo } from "./zotero-api.js";
import { escapeHtml } from "./utils.js";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const ZOTERO_API_KEY = process.env.ZOTERO_API_KEY;
const ZOTERO_LIBRARY_ID = process.env.ZOTERO_LIBRARY_ID;

const ZOTERO_DATA_DIR = process.env.ZOTERO_DATA_DIR ?? join(homedir(), "Zotero");

if (!ZOTERO_API_KEY || !ZOTERO_LIBRARY_ID) {
  console.error(
    "Error: ZOTERO_API_KEY and ZOTERO_LIBRARY_ID environment variables are required.\n" +
      "  export ZOTERO_API_KEY=your_api_key\n" +
      "  export ZOTERO_LIBRARY_ID=your_library_id",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Initialise client & server
// ---------------------------------------------------------------------------

const zotero = new ZoteroClient({
  apiKey: ZOTERO_API_KEY,
  libraryId: ZOTERO_LIBRARY_ID,
});

const server = new McpServer({
  name: "zotero-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool 1: list_collections
// ---------------------------------------------------------------------------

server.tool(
  "list_collections",
  "List all collections in the Zotero library. Returns collection names, keys, and parent hierarchy.",
  {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of results to return (1-100, default 25)"),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Number of results to skip for pagination (default 0)"),
  },
  async ({ limit, offset }) => {
    try {
      const result = await zotero.listCollections({ limit, offset });
      const collections = result.items.map((c) => ({
        key: c.data.key,
        name: c.data.name,
        parentCollection: c.data.parentCollection || null,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                collections,
                totalResults: result.totalResults,
                offset: result.offset,
                limit: result.limit,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 2: create_collection
// ---------------------------------------------------------------------------

server.tool(
  "create_collection",
  "Create a new collection in the Zotero library.",
  {
    name: z.string().min(1).describe("Name of the new collection"),
    parentCollection: z
      .string()
      .optional()
      .describe("Parent collection key to create a sub-collection (optional)"),
  },
  async ({ name, parentCollection }) => {
    try {
      const result = await zotero.createCollection(name, parentCollection);

      if (Object.keys(result.failed).length > 0) {
        const reasons = Object.values(result.failed)
          .map((f) => f.message)
          .join("; ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create collection: ${reasons}`,
            },
          ],
          isError: true,
        };
      }

      const createdKey = Object.values(result.success)[0];
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `Collection "${name}" created successfully`,
                key: createdKey,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 3: create_note
// ---------------------------------------------------------------------------

server.tool(
  "create_note",
  "Create a standalone note in the Zotero library. Supports an optional Zotero-compatible HTML template.",
  {
    title: z.string().min(1).describe("Title of the note"),
    content: z.string().min(1).describe("Note body as HTML"),
    collectionKeys: z
      .array(z.string())
      .optional()
      .describe("Collection keys to add the note to (optional)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for the note (optional)"),
    useTemplate: z
      .boolean()
      .default(true)
      .describe(
        "Wrap content in the standard Zotero note template with title, date, and footer (default: true)",
      ),
  },
  async ({ title, content, collectionKeys, tags, useTemplate }) => {
    try {
      let noteHtml: string;

      if (useTemplate) {
        const today = new Date().toISOString().split("T")[0];
        noteHtml =
          `<div class="zotero-note znv1"><div data-schema-version="9">\n` +
          `<h1>${escapeHtml(title)}</h1>\n` +
          `<p><em>Created ${today} by Claude</em></p>\n` +
          `${content}\n` +
          `<p><em>Son g\u00fcncelleme: ${today}</em></p>\n` +
          `</div></div>`;
      } else {
        noteHtml = content;
      }

      const tagObjects = tags?.map((t) => ({ tag: t }));
      const result = await zotero.createNote(noteHtml, collectionKeys, tagObjects);

      if (Object.keys(result.failed).length > 0) {
        const reasons = Object.values(result.failed)
          .map((f) => f.message)
          .join("; ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to create note: ${reasons}`,
            },
          ],
          isError: true,
        };
      }

      const createdKey = Object.values(result.success)[0];
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `Note "${title}" created successfully`,
                key: createdKey,
                zoteroLink: `zotero://select/library/items/${createdKey}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 4: add_note_to_collection
// ---------------------------------------------------------------------------

server.tool(
  "add_note_to_collection",
  "Add an existing item (note, article, etc.) to a collection. Fetches the item, appends the collection key, and patches it.",
  {
    itemKey: z.string().min(1).describe("Zotero item key (8-character key)"),
    collectionKey: z
      .string()
      .min(1)
      .describe("Target collection key to add the item to"),
  },
  async ({ itemKey, collectionKey }) => {
    try {
      // Check if already in collection
      const item = await zotero.getItem(itemKey);
      const currentCollections = item.data.collections ?? [];

      if (currentCollections.includes(collectionKey)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Item ${itemKey} is already in collection ${collectionKey}.`,
            },
          ],
        };
      }

      await zotero.addItemToCollection(itemKey, collectionKey);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                message: `Item ${itemKey} added to collection ${collectionKey}`,
                itemKey,
                collectionKey,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 5: search_items
// ---------------------------------------------------------------------------

server.tool(
  "search_items",
  "Search for items in the Zotero library by title, creator, year, or full text.",
  {
    query: z.string().min(1).describe("Search query string"),
    qmode: z
      .enum(["titleCreatorYear", "everything"])
      .default("titleCreatorYear")
      .describe(
        "Search mode: 'titleCreatorYear' (default) searches title/creator/year, 'everything' searches all fields including full text",
      ),
    itemType: z
      .string()
      .optional()
      .describe(
        "Filter by item type, e.g. 'journalArticle', 'book', 'note', 'conferencePaper' (optional)",
      ),
    sort: z
      .enum(["dateModified", "dateAdded", "title", "creator", "date"])
      .default("dateModified")
      .describe("Sort field (default: dateModified)"),
    direction: z
      .enum(["asc", "desc"])
      .default("desc")
      .describe("Sort direction (default: desc)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Maximum number of results (1-100, default 25)"),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Number of results to skip for pagination (default 0)"),
  },
  async ({ query, qmode, itemType, sort, direction, limit, offset }) => {
    try {
      const result = await zotero.searchItems({
        query,
        qmode,
        itemType,
        sort,
        direction,
        limit,
        offset,
      });

      const items = result.items.map((item) => ({
        key: item.data.key,
        itemType: item.data.itemType,
        title:
          item.data.title ??
          item.data.note?.substring(0, 120) ??
          "(no title)",
        creators: item.data.creators?.map((c) =>
          c.name ? c.name : `${c.lastName ?? ""}, ${c.firstName ?? ""}`,
        ),
        date: item.data.date,
        tags: item.data.tags?.map((t) => t.tag),
        collections: item.data.collections,
        zoteroLink: `zotero://select/library/items/${item.data.key}`,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                items,
                totalResults: result.totalResults,
                offset: result.offset,
                limit: result.limit,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 6: get_item_attachments
// ---------------------------------------------------------------------------

server.tool(
  "get_item_attachments",
  "List attachments (PDFs, snapshots, etc.) for a Zotero item. Reports local file paths when Zotero Desktop storage is available.",
  {
    itemKey: z
      .string()
      .min(1)
      .describe("Zotero item key (8-character key of the parent item)"),
  },
  async ({ itemKey }) => {
    try {
      const children = await zotero.getItemChildren(itemKey, true);

      if (children.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  message: `No attachments found for item ${itemKey}.`,
                  itemKey,
                  attachments: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const attachments: AttachmentInfo[] = children.map((child) => {
        const d = child.data;
        const filename = (d.filename as string) ?? "";
        const key = d.key;
        const info: AttachmentInfo = {
          key,
          title: d.title ?? filename,
          contentType: (d.contentType as string) ?? "unknown",
          filename,
          linkMode: (d.linkMode as string) ?? "unknown",
        };

        // Check local file existence
        if (filename && ZOTERO_DATA_DIR) {
          const localPath = join(ZOTERO_DATA_DIR, "storage", key, filename);
          if (existsSync(localPath)) {
            info.localPath = localPath;
            try {
              info.fileSize = statSync(localPath).size;
            } catch { /* ignore stat errors */ }
          }
        }
        return info;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { itemKey, attachments, totalAttachments: attachments.length },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error: ${(error as Error).message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Zotero MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
