/**
 * Zotero Web API v3 client with rate limiting.
 *
 * Handles all HTTP communication with the Zotero API including
 * authentication, rate limiting (1 req/sec), pagination, and
 * write tokens for mutating operations.
 *
 * @see https://www.zotero.org/support/dev/web_api/v3/basics
 */

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZoteroConfig {
  apiKey: string;
  libraryId: string;
  baseUrl?: string; // default: "https://api.zotero.org"
}

export interface ZoteroCollectionData {
  key: string;
  name: string;
  parentCollection: string | false;
  version: number;
}

export interface ZoteroCollection {
  key: string;
  version: number;
  library: { type: string; id: number; name: string };
  data: ZoteroCollectionData;
}

export interface ZoteroCreator {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface ZoteroTag {
  tag: string;
  type?: number;
}

export interface ZoteroItemData {
  key: string;
  version: number;
  itemType: string;
  title?: string;
  note?: string;
  creators?: ZoteroCreator[];
  tags?: ZoteroTag[];
  collections?: string[];
  date?: string;
  abstractNote?: string;
  DOI?: string;
  url?: string;
  [field: string]: unknown;
}

export interface ZoteroItem {
  key: string;
  version: number;
  library: { type: string; id: number; name: string };
  data: ZoteroItemData;
}

export interface ZoteroWriteResponse {
  success: Record<string, string>;
  unchanged: Record<string, string>;
  failed: Record<string, { code: number; message: string }>;
}

export interface PaginatedResult<T> {
  items: T[];
  totalResults: number;
  offset: number;
  limit: number;
}

/** Attachment-specific fields returned by Zotero API. */
export interface ZoteroAttachmentData {
  key: string;
  version: number;
  itemType: "attachment";
  title?: string;
  parentItem?: string;
  contentType?: string;
  filename?: string;
  linkMode: "imported_file" | "linked_file" | "linked_url" | "imported_url";
  path?: string;
  url?: string;
  accessDate?: string;
  tags?: ZoteroTag[];
  collections?: string[];
  [field: string]: unknown;
}

/** Full-text content returned by Zotero fulltext endpoint. */
export interface ZoteroFullText {
  content: string;
  indexedPages?: number;
  totalPages?: number;
  indexedChars?: number;
  totalChars?: number;
}

/** Summarised attachment info for tool output. */
export interface AttachmentInfo {
  key: string;
  title: string;
  contentType: string;
  filename: string;
  linkMode: string;
  localPath?: string;
  fileSize?: number;
}

// ---------------------------------------------------------------------------
// ZoteroClient
// ---------------------------------------------------------------------------

export class ZoteroClient {
  private readonly apiKey: string;
  private readonly libraryId: string;
  private readonly baseUrl: string;
  private lastRequestTime = 0;
  private backoffUntil = 0;

  private static readonly MIN_INTERVAL_MS = 1000; // 1 req/sec

  constructor(config: ZoteroConfig) {
    this.apiKey = config.apiKey;
    this.libraryId = config.libraryId;
    this.baseUrl = (config.baseUrl ?? "https://api.zotero.org").replace(
      /\/$/,
      "",
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Base URL prefix for user library endpoints. */
  private get userPrefix(): string {
    return `${this.baseUrl}/users/${this.libraryId}`;
  }

  /** Common headers for every request. */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "Zotero-API-Version": "3",
      "Zotero-API-Key": this.apiKey,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /**
   * Rate-limited fetch wrapper.
   *
   * Enforces a minimum interval of 1 second between requests and
   * respects Backoff / Retry-After headers returned by the API.
   */
  private async rateLimitedFetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    // Honour server-requested backoff
    const now = Date.now();
    if (this.backoffUntil > now) {
      await this.sleep(this.backoffUntil - now);
    }

    // Enforce 1 req/sec minimum interval
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < ZoteroClient.MIN_INTERVAL_MS) {
      await this.sleep(ZoteroClient.MIN_INTERVAL_MS - elapsed);
    }

    this.lastRequestTime = Date.now();
    const response = await fetch(url, init);

    // Handle Backoff header (seconds to wait before next request)
    const backoff = response.headers.get("Backoff");
    if (backoff) {
      this.backoffUntil = Date.now() + parseInt(backoff, 10) * 1000;
    }

    // Handle 429 Too Many Requests
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
      console.error(`Rate limited. Waiting ${waitMs}ms before retry…`);
      await this.sleep(waitMs);
      this.lastRequestTime = Date.now();
      return fetch(url, init);
    }

    return response;
  }

  /** Throw a descriptive error based on HTTP status. */
  private async throwOnError(response: Response, context: string): Promise<void> {
    if (response.ok) return;

    const status = response.status;
    const body = await response.text().catch(() => "");

    const messages: Record<number, string> = {
      400: "Bad request — check parameters",
      403: "Forbidden — invalid API key or insufficient permissions",
      404: "Not found — check the key or library ID",
      409: "Conflict — the library is currently locked; try again later",
      412: "Precondition failed — item was modified by another client",
      413: "Request too large",
      429: "Rate limit exceeded",
      503: "Zotero service temporarily unavailable",
    };

    const msg = messages[status] ?? `HTTP ${status}`;
    throw new Error(`${context}: ${msg}${body ? ` — ${body}` : ""}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Public API methods
  // -------------------------------------------------------------------------

  /**
   * List collections in the library with pagination support.
   */
  async listCollections(params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<ZoteroCollection>> {
    const limit = params?.limit ?? 25;
    const offset = params?.offset ?? 0;

    const url = `${this.userPrefix}/collections?limit=${limit}&start=${offset}&format=json`;
    const response = await this.rateLimitedFetch(url, {
      headers: this.headers(),
    });

    await this.throwOnError(response, "listCollections");

    const items: ZoteroCollection[] = await response.json() as ZoteroCollection[];
    const totalResults = parseInt(
      response.headers.get("Total-Results") ?? String(items.length),
      10,
    );

    return { items, totalResults, offset, limit };
  }

  /**
   * Create a new collection. Returns the Zotero write response.
   */
  async createCollection(
    name: string,
    parentCollection?: string,
  ): Promise<ZoteroWriteResponse> {
    const url = `${this.userPrefix}/collections`;
    const body = [
      {
        name,
        ...(parentCollection ? { parentCollection } : {}),
      },
    ];

    const response = await this.rateLimitedFetch(url, {
      method: "POST",
      headers: this.headers({ "Zotero-Write-Token": randomUUID() }),
      body: JSON.stringify(body),
    });

    await this.throwOnError(response, "createCollection");
    return (await response.json()) as ZoteroWriteResponse;
  }

  /**
   * Create a standalone note. Optionally add it to collections and tag it.
   */
  async createNote(
    noteHtml: string,
    collectionKeys?: string[],
    tags?: ZoteroTag[],
  ): Promise<ZoteroWriteResponse> {
    const url = `${this.userPrefix}/items`;
    const body = [
      {
        itemType: "note",
        note: noteHtml,
        tags: tags ?? [],
        collections: collectionKeys ?? [],
      },
    ];

    const response = await this.rateLimitedFetch(url, {
      method: "POST",
      headers: this.headers({ "Zotero-Write-Token": randomUUID() }),
      body: JSON.stringify(body),
    });

    await this.throwOnError(response, "createNote");
    return (await response.json()) as ZoteroWriteResponse;
  }

  /**
   * Retrieve a single item by key.
   */
  async getItem(itemKey: string): Promise<ZoteroItem> {
    const url = `${this.userPrefix}/items/${itemKey}?format=json`;
    const response = await this.rateLimitedFetch(url, {
      headers: this.headers(),
    });

    await this.throwOnError(response, `getItem(${itemKey})`);
    return (await response.json()) as ZoteroItem;
  }

  /**
   * Add an existing item to a collection.
   *
   * Fetches the item first to get its current version and collections,
   * then patches with the new collection key appended.
   */
  async addItemToCollection(
    itemKey: string,
    collectionKey: string,
  ): Promise<void> {
    // 1. Get current item state
    const item = await this.getItem(itemKey);
    const currentCollections = item.data.collections ?? [];

    if (currentCollections.includes(collectionKey)) {
      return; // Already in the collection
    }

    // 2. Patch with new collection list
    const url = `${this.userPrefix}/items/${itemKey}`;
    const response = await this.rateLimitedFetch(url, {
      method: "PATCH",
      headers: this.headers({
        "If-Unmodified-Since-Version": String(item.version),
      }),
      body: JSON.stringify({
        collections: [...currentCollections, collectionKey],
      }),
    });

    await this.throwOnError(response, `addItemToCollection(${itemKey})`);
  }

  /**
   * List child items (attachments, notes) of a parent item.
   * Optionally filter to only attachment items.
   */
  async getItemChildren(
    itemKey: string,
    attachmentsOnly = false,
  ): Promise<ZoteroItem[]> {
    const url = `${this.userPrefix}/items/${itemKey}/children?format=json`;
    const response = await this.rateLimitedFetch(url, {
      headers: this.headers(),
    });

    await this.throwOnError(response, `getItemChildren(${itemKey})`);
    const items: ZoteroItem[] = (await response.json()) as ZoteroItem[];

    if (attachmentsOnly) {
      return items.filter((i) => i.data.itemType === "attachment");
    }
    return items;
  }

  /**
   * Search for items in the library with pagination.
   */
  async searchItems(params: {
    query: string;
    qmode?: "titleCreatorYear" | "everything";
    itemType?: string;
    sort?: string;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<ZoteroItem>> {
    const limit = params.limit ?? 25;
    const offset = params.offset ?? 0;
    const qmode = params.qmode ?? "titleCreatorYear";
    const sort = params.sort ?? "dateModified";
    const direction = params.direction ?? "desc";

    const searchParams = new URLSearchParams({
      q: params.query,
      qmode,
      sort,
      direction,
      limit: String(limit),
      start: String(offset),
      format: "json",
    });

    if (params.itemType) {
      searchParams.set("itemType", params.itemType);
    }

    const url = `${this.userPrefix}/items?${searchParams.toString()}`;
    const response = await this.rateLimitedFetch(url, {
      headers: this.headers(),
    });

    await this.throwOnError(response, "searchItems");

    const items: ZoteroItem[] = await response.json() as ZoteroItem[];
    const totalResults = parseInt(
      response.headers.get("Total-Results") ?? String(items.length),
      10,
    );

    return { items, totalResults, offset, limit };
  }
}
