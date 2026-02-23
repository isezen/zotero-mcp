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
 *   - get_item               — Get a single item by key with full metadata
 *   - search_items           — Search items by title, creator, year, or full text
 *   - get_item_attachments   — List attachments for an item (local path detection)
 *   - get_item_fulltext      — Get full-text content (local-first, API fallback)
 *   - read_attachment        — Read attachment file (local path or base64 download)
 *
 * Environment variables (required unless ZOTERO_LOCAL=true):
 *   ZOTERO_API_KEY      — Zotero API key
 *   ZOTERO_LIBRARY_ID   — Zotero user/group library ID
 *
 * Environment variables (optional):
 *   ZOTERO_DATA_DIR     — Local Zotero data directory (default: ~/Zotero)
 *   ZOTERO_LOCAL        — Connect to Zotero Desktop local API (default: false)
 *   ZOTERO_LIBRARY_TYPE — "user" (default) or "group"
 *
 * @see https://www.zotero.org/support/dev/web_api/v3/basics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { ZoteroClient } from "./zotero-api.js";
import type { AttachmentInfo } from "./zotero-api.js";
import {
  escapeHtml,
  formatItemMarkdown,
  formatItemSummary,
} from "./utils.js";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const ZOTERO_LOCAL = process.env.ZOTERO_LOCAL === "true";
const ZOTERO_API_KEY = process.env.ZOTERO_API_KEY;
const ZOTERO_LIBRARY_ID = process.env.ZOTERO_LIBRARY_ID;
const ZOTERO_LIBRARY_TYPE =
  (process.env.ZOTERO_LIBRARY_TYPE ?? "user") as "user" | "group";

const ZOTERO_DATA_DIR = process.env.ZOTERO_DATA_DIR ?? join(homedir(), "Zotero");

if (!ZOTERO_LOCAL && (!ZOTERO_API_KEY || !ZOTERO_LIBRARY_ID)) {
  console.error(
    "Error: ZOTERO_API_KEY and ZOTERO_LIBRARY_ID are required (unless ZOTERO_LOCAL=true).\n" +
      "  export ZOTERO_API_KEY=your_api_key\n" +
      "  export ZOTERO_LIBRARY_ID=your_library_id\n" +
      "  # OR for local Zotero Desktop API:\n" +
      "  export ZOTERO_LOCAL=true",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Initialise client & server
// ---------------------------------------------------------------------------

const zotero = new ZoteroClient({
  apiKey: ZOTERO_LOCAL ? "" : ZOTERO_API_KEY!,
  libraryId: ZOTERO_LOCAL ? (ZOTERO_LIBRARY_ID ?? "0") : ZOTERO_LIBRARY_ID!,
  libraryType: ZOTERO_LIBRARY_TYPE,
  isLocal: ZOTERO_LOCAL,
  baseUrl: ZOTERO_LOCAL ? "http://127.0.0.1:23119/api" : undefined,
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
// Tool 5: get_item
// ---------------------------------------------------------------------------

server.tool(
  "get_item",
  "Get a single item by key. Returns full item metadata including title, creators, date, DOI, abstract, tags, and collections.",
  {
    itemKey: z
      .string()
      .min(1)
      .describe("Zotero item key (8-character key)"),
  },
  async ({ itemKey }) => {
    try {
      const item = await zotero.getItem(itemKey);
      return {
        content: [
          { type: "text" as const, text: formatItemMarkdown(item.data) },
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
// Tool 6: search_items
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
    tag: z
      .string()
      .optional()
      .describe(
        "Filter by tag. Supports boolean: 'tag1 || tag2' (OR), '-tag' (NOT). (optional)",
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
  async ({ query, qmode, itemType, tag, sort, direction, limit, offset }) => {
    try {
      const result = await zotero.searchItems({
        query,
        qmode,
        itemType,
        tag,
        sort,
        direction,
        limit,
        offset,
      });

      const showStart = result.offset + 1;
      const showEnd = result.offset + result.items.length;
      const header = `**Found ${result.totalResults} items** (showing ${showStart}-${showEnd})`;
      const items = result.items.map((item) => formatItemSummary(item.data));
      const text = [header, "", ...items.flatMap((s) => [s, "\n---\n"])].join("\n").trimEnd();

      return {
        content: [{ type: "text" as const, text }],
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
// Tool 7: get_item_attachments
// ---------------------------------------------------------------------------

server.tool(
  "get_item_attachments",
  "List attachments (PDFs, snapshots, etc.) for a Zotero item. Reports local file paths when Zotero Desktop storage is available.",
  {
    itemKey: z
      .string()
      .min(1)
      .describe("Zotero item key (8-character key of the parent item)"),
    forceRemote: z
      .boolean()
      .default(false)
      .describe(
        "When true, skip local storage detection and only report API-accessible info (default: false)",
      ),
  },
  async ({ itemKey, forceRemote }) => {
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

        // Check local file existence (skip when forceRemote is set)
        if (!forceRemote && filename && ZOTERO_DATA_DIR) {
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
// Tool 8: get_item_fulltext
// ---------------------------------------------------------------------------

server.tool(
  "get_item_fulltext",
  "Get the full-text content of an item. Checks local Zotero cache first, falls back to the Zotero API. Returns plain text extracted from the attachment (e.g. PDF).",
  {
    itemKey: z
      .string()
      .min(1)
      .describe(
        "Zotero item key — either the attachment key or the parent item key. " +
        "When a parent key is given, the first PDF attachment is used.",
      ),
    forceRemote: z
      .boolean()
      .default(false)
      .describe(
        "When true, skip local cache and fetch full text directly from Zotero API (default: false)",
      ),
  },
  async ({ itemKey, forceRemote }) => {
    try {
      // Try to resolve the attachment key when a parent item is given.
      let attachmentKey = itemKey;
      const item = await zotero.getItem(itemKey);
      if (item.data.itemType !== "attachment") {
        const children = await zotero.getItemChildren(itemKey, true);
        const pdfChild = children.find(
          (c) => (c.data.contentType as string) === "application/pdf",
        );
        if (pdfChild) {
          attachmentKey = pdfChild.data.key;
        } else if (children.length > 0) {
          attachmentKey = children[0].data.key;
        }
        // If no children, keep the original key and let the API decide.
      }

      // 1. Try local .zotero-ft-cache (skip when forceRemote is set)
      if (!forceRemote && ZOTERO_DATA_DIR) {
        const cachePath = join(
          ZOTERO_DATA_DIR,
          "storage",
          attachmentKey,
          ".zotero-ft-cache",
        );
        if (existsSync(cachePath)) {
          const content = readFileSync(cachePath, "utf-8");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { itemKey, attachmentKey, source: "local", content },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }

      // 2. Fall back to Zotero API fulltext endpoint
      const fulltext = await zotero.getFullText(attachmentKey);

      if (!fulltext) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  itemKey,
                  attachmentKey,
                  message:
                    "No full-text content available for this item. " +
                    "The PDF may not have been indexed by Zotero yet.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                itemKey,
                attachmentKey,
                source: "api",
                content: fulltext.content,
                indexedPages: fulltext.indexedPages,
                totalPages: fulltext.totalPages,
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
// Tool 9: read_attachment
// ---------------------------------------------------------------------------

server.tool(
  "read_attachment",
  "Read an attachment file. Returns the local file path if available (so Claude can read it directly) or downloads via API as base64. Accepts either an attachment key or a parent item key (auto-resolves to the first PDF child).",
  {
    itemKey: z
      .string()
      .min(1)
      .describe(
        "Zotero item key — either the attachment key or the parent item key. " +
        "When a parent key is given, the first PDF attachment is used.",
      ),
    forceRemote: z
      .boolean()
      .default(false)
      .describe(
        "When true, skip local file and download directly from Zotero API (default: false)",
      ),
  },
  async ({ itemKey, forceRemote }) => {
    try {
      // Resolve to an attachment key if a parent item is given.
      let attachmentKey = itemKey;
      let filename = "";
      let contentType = "";

      const item = await zotero.getItem(itemKey);
      if (item.data.itemType === "attachment") {
        filename = (item.data.filename as string) ?? "";
        contentType = (item.data.contentType as string) ?? "";
      } else {
        const children = await zotero.getItemChildren(itemKey, true);
        const pdfChild = children.find(
          (c) => (c.data.contentType as string) === "application/pdf",
        );
        const target = pdfChild ?? children[0];
        if (!target) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    itemKey,
                    message:
                      "No attachments found for this item. " +
                      "Only metadata is available — a review based on metadata alone may be unreliable.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        attachmentKey = target.data.key;
        filename = (target.data.filename as string) ?? "";
        contentType = (target.data.contentType as string) ?? "";
      }

      // 1. Try local file (skip when forceRemote is set)
      if (!forceRemote && filename && ZOTERO_DATA_DIR) {
        const localPath = join(
          ZOTERO_DATA_DIR,
          "storage",
          attachmentKey,
          filename,
        );
        if (existsSync(localPath)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    itemKey,
                    attachmentKey,
                    source: "local",
                    localPath,
                    contentType,
                    filename,
                    message:
                      "File is available locally. Use the localPath to read it directly.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }

      // 2. Download from API
      const download = await zotero.downloadAttachment(attachmentKey);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                itemKey,
                attachmentKey,
                source: "api",
                contentType: download.contentType,
                filename: download.filename,
                sizeBytes: Buffer.from(download.data, "base64").length,
                message:
                  "File downloaded from Zotero API. The data field contains base64-encoded content.",
              },
              null,
              2,
            ),
          },
          {
            type: "resource" as const,
            resource: {
              uri: `zotero://attachment/${attachmentKey}`,
              mimeType: download.contentType,
              blob: download.data,
            },
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
// CLI arguments
// ---------------------------------------------------------------------------

function parseArgs(): { transport: "stdio" | "sse"; port: number } {
  let transport: "stdio" | "sse" = "stdio";
  let port = 3000;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--transport" && process.argv[i + 1]) {
      const v = process.argv[i + 1];
      if (v === "stdio" || v === "sse") transport = v;
      i++;
    }
    if (process.argv[i] === "--port" && process.argv[i + 1]) {
      port = parseInt(process.argv[i + 1], 10);
      i++;
    }
  }
  return { transport, port };
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.transport === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Zotero MCP server running on stdio");
  } else {
    const { createServer } = await import("node:http");
    const { SSEServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/sse.js"
    );

    const sessions = new Map<string, InstanceType<typeof SSEServerTransport>>();

    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? "", `http://localhost:${args.port}`);

      if (req.method === "GET" && url.pathname === "/sse") {
        const transport = new SSEServerTransport("/messages", res);
        sessions.set(transport.sessionId, transport);
        transport.onclose = () => sessions.delete(transport.sessionId);
        await server.connect(transport);
        await transport.start();
      } else if (req.method === "POST" && url.pathname === "/messages") {
        const sessionId = url.searchParams.get("sessionId");
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid or missing sessionId");
          return;
        }
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    });

    httpServer.listen(args.port, () => {
      console.error(
        `Zotero MCP server running on SSE at http://localhost:${args.port}/sse`,
      );
    });
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
