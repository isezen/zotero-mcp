/**
 * Shared test helpers: mock fetch factory and fixture data.
 */

import { vi } from "vitest";
import type {
  ZoteroCollection,
  ZoteroFullText,
  ZoteroItem,
  ZoteroWriteResponse,
} from "../zotero-api.js";

// ---------------------------------------------------------------------------
// Mock fetch factory
// ---------------------------------------------------------------------------

interface MockResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  bodyText?: string;
}

/**
 * Create a mock Response matching the global fetch signature.
 */
export function mockResponse(opts: MockResponseOptions = {}): Response {
  const status = opts.status ?? 200;
  const headers = new Headers(opts.headers ?? {});
  const bodyStr =
    opts.bodyText ?? (opts.body !== undefined ? JSON.stringify(opts.body) : "");

  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: () => Promise.resolve(opts.body),
    text: () => Promise.resolve(bodyStr),
    arrayBuffer: () =>
      Promise.resolve(new TextEncoder().encode(bodyStr).buffer),
  } as unknown as Response;
}

/**
 * Install a global fetch mock and return the mock function.
 * Call in beforeEach; vi.restoreAllMocks() in afterEach handles cleanup.
 */
export function mockFetch() {
  const fn = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>();
  vi.stubGlobal("fetch", fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const FIXTURES = {
  collection: {
    key: "ABC12345",
    version: 1,
    library: { type: "user", id: 123456, name: "Test User" },
    data: {
      key: "ABC12345",
      name: "Test Collection",
      parentCollection: false as const,
      version: 1,
    },
  } satisfies ZoteroCollection,

  item: {
    key: "ITEM1234",
    version: 5,
    library: { type: "user", id: 123456, name: "Test User" },
    data: {
      key: "ITEM1234",
      version: 5,
      itemType: "journalArticle",
      title: "Test Article",
      creators: [{ creatorType: "author", firstName: "John", lastName: "Doe" }],
      tags: [{ tag: "test" }],
      collections: ["COL00001"],
      date: "2024-01-15",
      abstractNote: "A test abstract.",
    },
  } satisfies ZoteroItem,

  noteItem: {
    key: "NOTE1234",
    version: 2,
    library: { type: "user", id: 123456, name: "Test User" },
    data: {
      key: "NOTE1234",
      version: 2,
      itemType: "note",
      note: "<p>Test note content</p>",
      tags: [],
      collections: [],
    },
  } satisfies ZoteroItem,

  writeSuccess: {
    success: { "0": "NEW12345" },
    unchanged: {},
    failed: {},
  } satisfies ZoteroWriteResponse,

  writeFailed: {
    success: {},
    unchanged: {},
    failed: { "0": { code: 400, message: "Invalid input" } },
  } satisfies ZoteroWriteResponse,

  attachmentItem: {
    key: "ATCH1234",
    version: 3,
    library: { type: "user", id: 123456, name: "Test User" },
    data: {
      key: "ATCH1234",
      version: 3,
      itemType: "attachment",
      title: "Test PDF",
      parentItem: "ITEM1234",
      contentType: "application/pdf",
      filename: "test-article.pdf",
      linkMode: "imported_file",
      tags: [],
      collections: [],
    },
  } satisfies ZoteroItem,

  fulltext: {
    content: "This is the full text content of the article.",
    indexedPages: 10,
    totalPages: 10,
  } satisfies ZoteroFullText,
} as const;
