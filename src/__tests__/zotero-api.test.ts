/**
 * Unit tests for ZoteroClient.
 *
 * All HTTP calls are mocked — no real Zotero API requests are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ZoteroClient } from "../zotero-api.js";
import { mockFetch, mockResponse, FIXTURES } from "./helpers.js";

const TEST_CONFIG = {
  apiKey: "test-api-key",
  libraryId: "123456",
  baseUrl: "https://api.zotero.org",
};

describe("ZoteroClient", () => {
  let client: ZoteroClient;
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock = mockFetch();
    client = new ZoteroClient(TEST_CONFIG);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("uses default baseUrl when not provided", () => {
      const c = new ZoteroClient({ apiKey: "k", libraryId: "1" });
      // We verify indirectly: listCollections should hit the default URL
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );
      // Fire and forget — we just check the URL
      c.listCollections().then(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("https://api.zotero.org/users/1/collections"),
          expect.anything(),
        );
      });
    });

    it("strips trailing slash from baseUrl", () => {
      const c = new ZoteroClient({
        apiKey: "k",
        libraryId: "1",
        baseUrl: "https://api.zotero.org/",
      });
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );
      c.listCollections().then(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("https://api.zotero.org/users/1/collections"),
          expect.anything(),
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------

  describe("rate limiting", () => {
    it("enforces minimum 1s interval between requests", async () => {
      fetchMock.mockResolvedValue(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.listCollections();
      const t0 = Date.now();
      await client.listCollections();
      const elapsed = Date.now() - t0;

      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });

    it("respects Backoff header", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0", Backoff: "3" },
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.listCollections();
      const t0 = Date.now();
      await client.listCollections();
      const elapsed = Date.now() - t0;

      // Should wait at least 3s (backoff) minus small tolerance
      expect(elapsed).toBeGreaterThanOrEqual(2900);
    });

    it("retries on 429 with Retry-After header", async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockResponse({
            status: 429,
            headers: { "Retry-After": "2" },
          }),
        )
        // The retry fetch (called directly, not through rateLimitedFetch)
        .mockResolvedValueOnce(
          mockResponse({
            body: [],
            headers: { "Total-Results": "0" },
          }),
        );

      const result = await client.listCollections();
      // Should have called fetch twice (original + retry)
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.items).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // throwOnError (tested indirectly via public methods)
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("throws on 403 Forbidden", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 403, bodyText: "Unauthorized" }),
      );

      await expect(client.listCollections()).rejects.toThrow(
        /Forbidden.*invalid API key/,
      );
    });

    it("throws on 404 Not Found", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 404, bodyText: "" }),
      );

      await expect(client.listCollections()).rejects.toThrow(/Not found/);
    });

    it("throws on unknown status code", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 500, bodyText: "Internal" }),
      );

      await expect(client.listCollections()).rejects.toThrow(/HTTP 500/);
    });
  });

  // -----------------------------------------------------------------------
  // listCollections
  // -----------------------------------------------------------------------

  describe("listCollections", () => {
    it("returns paginated collections", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [FIXTURES.collection],
          headers: { "Total-Results": "42" },
        }),
      );

      const result = await client.listCollections({ limit: 10, offset: 5 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].data.name).toBe("Test Collection");
      expect(result.totalResults).toBe(42);
      expect(result.offset).toBe(5);
      expect(result.limit).toBe(10);
    });

    it("sends correct URL with pagination params", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.listCollections({ limit: 50, offset: 10 });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("limit=50");
      expect(url).toContain("start=10");
      expect(url).toContain("format=json");
    });

    it("uses default pagination values", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.listCollections();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("limit=25");
      expect(url).toContain("start=0");
    });
  });

  // -----------------------------------------------------------------------
  // createCollection
  // -----------------------------------------------------------------------

  describe("createCollection", () => {
    it("sends POST with correct body and write token", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.writeSuccess }),
      );

      const result = await client.createCollection("My Collection");

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/collections"),
        expect.objectContaining({
          method: "POST",
        }),
      );

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Zotero-Write-Token"]).toBeDefined();
      expect(headers["Zotero-API-Version"]).toBe("3");

      const body = JSON.parse(init.body as string);
      expect(body).toEqual([{ name: "My Collection" }]);
      expect(result.success["0"]).toBe("NEW12345");
    });

    it("includes parentCollection when provided", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.writeSuccess }),
      );

      await client.createCollection("Sub Collection", "PARENT01");

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body).toEqual([
        { name: "Sub Collection", parentCollection: "PARENT01" },
      ]);
    });

    it("throws on API error", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 400, bodyText: "Bad request" }),
      );

      await expect(
        client.createCollection("Bad"),
      ).rejects.toThrow(/Bad request/);
    });
  });

  // -----------------------------------------------------------------------
  // createNote
  // -----------------------------------------------------------------------

  describe("createNote", () => {
    it("sends POST with note body, tags, and collections", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.writeSuccess }),
      );

      await client.createNote(
        "<p>Hello</p>",
        ["COL1"],
        [{ tag: "test" }],
      );

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body).toEqual([
        {
          itemType: "note",
          note: "<p>Hello</p>",
          tags: [{ tag: "test" }],
          collections: ["COL1"],
        },
      ]);
    });

    it("defaults tags and collections to empty arrays", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.writeSuccess }),
      );

      await client.createNote("<p>Note</p>");

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body[0].tags).toEqual([]);
      expect(body[0].collections).toEqual([]);
    });

    it("throws on API error", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 403, bodyText: "Forbidden" }),
      );

      await expect(client.createNote("<p>x</p>")).rejects.toThrow(/Forbidden/);
    });
  });

  // -----------------------------------------------------------------------
  // getItem
  // -----------------------------------------------------------------------

  describe("getItem", () => {
    it("returns parsed item", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.item }),
      );

      const item = await client.getItem("ITEM1234");

      expect(item.key).toBe("ITEM1234");
      expect(item.data.title).toBe("Test Article");
      expect(item.data.itemType).toBe("journalArticle");
    });

    it("builds correct URL", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.item }),
      );

      await client.getItem("ITEM1234");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/items/ITEM1234");
      expect(url).toContain("format=json");
    });

    it("throws on 404", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 404, bodyText: "" }),
      );

      await expect(client.getItem("BAD")).rejects.toThrow(/Not found/);
    });
  });

  // -----------------------------------------------------------------------
  // addItemToCollection
  // -----------------------------------------------------------------------

  describe("addItemToCollection", () => {
    it("skips PATCH when item is already in collection", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.item }),
      );

      // FIXTURES.item already has collections: ["COL00001"]
      await client.addItemToCollection("ITEM1234", "COL00001");

      // Only 1 call (GET), no PATCH
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("PATCHes with new collection appended", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse({ body: FIXTURES.item }))
        .mockResolvedValueOnce(mockResponse({ status: 204 }));

      await client.addItemToCollection("ITEM1234", "NEWCOL01");

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const patchInit = fetchMock.mock.calls[1][1] as RequestInit;
      expect(patchInit.method).toBe("PATCH");

      const patchBody = JSON.parse(patchInit.body as string);
      expect(patchBody.collections).toEqual(["COL00001", "NEWCOL01"]);

      const headers = patchInit.headers as Record<string, string>;
      expect(headers["If-Unmodified-Since-Version"]).toBe("5");
    });

    it("throws on PATCH error", async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse({ body: FIXTURES.item }))
        .mockResolvedValueOnce(
          mockResponse({ status: 412, bodyText: "Version conflict" }),
        );

      await expect(
        client.addItemToCollection("ITEM1234", "NEWCOL01"),
      ).rejects.toThrow(/Precondition failed/);
    });
  });

  // -----------------------------------------------------------------------
  // searchItems
  // -----------------------------------------------------------------------

  describe("searchItems", () => {
    it("returns paginated search results", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [FIXTURES.item],
          headers: { "Total-Results": "100" },
        }),
      );

      const result = await client.searchItems({
        query: "test",
        limit: 10,
        offset: 0,
      });

      expect(result.items).toHaveLength(1);
      expect(result.totalResults).toBe(100);
      expect(result.items[0].data.title).toBe("Test Article");
    });

    it("builds correct query parameters", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.searchItems({
        query: "machine learning",
        qmode: "everything",
        sort: "title",
        direction: "asc",
        limit: 50,
        offset: 20,
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("q=machine+learning");
      expect(url).toContain("qmode=everything");
      expect(url).toContain("sort=title");
      expect(url).toContain("direction=asc");
      expect(url).toContain("limit=50");
      expect(url).toContain("start=20");
      expect(url).toContain("format=json");
    });

    it("includes itemType filter when provided", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.searchItems({
        query: "test",
        itemType: "journalArticle",
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("itemType=journalArticle");
    });

    it("uses default values for optional params", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          body: [],
          headers: { "Total-Results": "0" },
        }),
      );

      await client.searchItems({ query: "test" });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("qmode=titleCreatorYear");
      expect(url).toContain("sort=dateModified");
      expect(url).toContain("direction=desc");
      expect(url).toContain("limit=25");
      expect(url).toContain("start=0");
    });

    it("throws on API error", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 503, bodyText: "" }),
      );

      await expect(
        client.searchItems({ query: "test" }),
      ).rejects.toThrow(/temporarily unavailable/);
    });
  });

  // -----------------------------------------------------------------------
  // getItemChildren
  // -----------------------------------------------------------------------

  describe("getItemChildren", () => {
    it("returns all children", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [FIXTURES.attachmentItem, FIXTURES.noteItem] }),
      );

      const result = await client.getItemChildren("ITEM1234");

      expect(result).toHaveLength(2);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/items/ITEM1234/children");
    });

    it("filters to attachments only", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [FIXTURES.attachmentItem, FIXTURES.noteItem] }),
      );

      const result = await client.getItemChildren("ITEM1234", true);

      expect(result).toHaveLength(1);
      expect(result[0].data.itemType).toBe("attachment");
    });

    it("throws on 404", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 404, bodyText: "" }),
      );

      await expect(client.getItemChildren("BAD")).rejects.toThrow(/Not found/);
    });
  });

  // -----------------------------------------------------------------------
  // getFullText
  // -----------------------------------------------------------------------

  describe("getFullText", () => {
    it("returns fulltext content", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.fulltext }),
      );

      const result = await client.getFullText("ATCH1234");

      expect(result).not.toBeNull();
      expect(result!.content).toBe(
        "This is the full text content of the article.",
      );
      expect(result!.indexedPages).toBe(10);
    });

    it("returns null on 404 (not indexed)", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 404, bodyText: "" }),
      );

      const result = await client.getFullText("NOTEXT");

      expect(result).toBeNull();
    });

    it("builds correct URL", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: FIXTURES.fulltext }),
      );

      await client.getFullText("ATCH1234");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/items/ATCH1234/fulltext");
    });

    it("throws on other errors", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 403, bodyText: "Forbidden" }),
      );

      await expect(client.getFullText("BAD")).rejects.toThrow(/Forbidden/);
    });
  });

  // -----------------------------------------------------------------------
  // downloadAttachment
  // -----------------------------------------------------------------------

  describe("downloadAttachment", () => {
    it("returns base64 data with metadata", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          bodyText: "fake-pdf-content",
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="paper.pdf"',
          },
        }),
      );

      const result = await client.downloadAttachment("ATCH1234");

      expect(result.contentType).toBe("application/pdf");
      expect(result.filename).toBe("paper.pdf");
      const decoded = Buffer.from(result.data, "base64").toString();
      expect(decoded).toBe("fake-pdf-content");
    });

    it("uses fallback filename when Content-Disposition is missing", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          bodyText: "data",
          headers: { "Content-Type": "application/pdf" },
        }),
      );

      const result = await client.downloadAttachment("ATCH1234");

      expect(result.filename).toBe("ATCH1234.bin");
    });

    it("throws on 404", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ status: 404, bodyText: "" }),
      );

      await expect(client.downloadAttachment("BAD")).rejects.toThrow(
        /Not found/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Local API mode
  // -----------------------------------------------------------------------

  describe("local API mode", () => {
    let localClient: ZoteroClient;

    beforeEach(() => {
      localClient = new ZoteroClient({
        apiKey: "",
        libraryId: "0",
        baseUrl: "http://127.0.0.1:23119/api",
        isLocal: true,
      });
    });

    it("uses localhost URL", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await localClient.listCollections();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("http://127.0.0.1:23119/api/users/0/collections");
    });

    it("omits Zotero-API-Key header", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await localClient.listCollections();
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Zotero-API-Key"]).toBeUndefined();
    });

    it("still includes Zotero-API-Version header", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await localClient.listCollections();
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["Zotero-API-Version"]).toBe("3");
    });
  });

  // -----------------------------------------------------------------------
  // Group library
  // -----------------------------------------------------------------------

  describe("group library", () => {
    it("uses /groups/ prefix when libraryType is group", async () => {
      const groupClient = new ZoteroClient({
        apiKey: "k",
        libraryId: "99999",
        libraryType: "group",
      });
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await groupClient.listCollections();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/groups/99999/collections");
    });

    it("defaults to /users/ prefix", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await client.listCollections();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/users/123456/collections");
    });
  });

  // -----------------------------------------------------------------------
  // Tag search
  // -----------------------------------------------------------------------

  describe("tag search", () => {
    it("includes tag parameter when provided", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await client.searchItems({ query: "test", tag: "machine-learning" });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("tag=machine-learning");
    });

    it("omits tag parameter when not provided", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ body: [], headers: { "Total-Results": "0" } }),
      );
      await client.searchItems({ query: "test" });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain("tag=");
    });
  });
});
