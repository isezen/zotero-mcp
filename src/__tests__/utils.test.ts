/**
 * Unit tests for utility functions: escapeHtml, formatCreator,
 * htmlToMarkdown, truncate, formatItemMarkdown, formatItemSummary.
 */

import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatCreator,
  htmlToMarkdown,
  truncate,
  formatItemMarkdown,
  formatItemSummary,
} from "../utils.js";
import type { ZoteroItemData } from "../zotero-api.js";

// ---------------------------------------------------------------------------
// escapeHtml (migrated from escapeHtml.test.ts)
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater-than", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes multiple special characters at once", () => {
    expect(escapeHtml('<div class="a&b">')).toBe(
      "&lt;div class=&quot;a&amp;b&quot;&gt;",
    );
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// formatCreator
// ---------------------------------------------------------------------------

describe("formatCreator", () => {
  it("formats author with first and last name", () => {
    expect(
      formatCreator({ creatorType: "author", firstName: "John", lastName: "Doe" }),
    ).toBe("Doe, John");
  });

  it("formats single-name creator", () => {
    expect(
      formatCreator({ creatorType: "author", name: "UNESCO" }),
    ).toBe("UNESCO");
  });

  it("appends role for non-author creators", () => {
    expect(
      formatCreator({ creatorType: "editor", firstName: "Jane", lastName: "Smith" }),
    ).toBe("Smith, Jane (editor)");
  });

  it("handles missing firstName", () => {
    expect(
      formatCreator({ creatorType: "author", lastName: "Doe" }),
    ).toBe("Doe");
  });

  it("handles missing lastName", () => {
    expect(
      formatCreator({ creatorType: "author", firstName: "John" }),
    ).toBe("John");
  });
});

// ---------------------------------------------------------------------------
// htmlToMarkdown
// ---------------------------------------------------------------------------

describe("htmlToMarkdown", () => {
  it("converts <strong> to **bold**", () => {
    expect(htmlToMarkdown("<strong>bold</strong>")).toBe("**bold**");
  });

  it("converts <b> to **bold**", () => {
    expect(htmlToMarkdown("<b>bold</b>")).toBe("**bold**");
  });

  it("converts <em> to *italic*", () => {
    expect(htmlToMarkdown("<em>italic</em>")).toBe("*italic*");
  });

  it("converts <i> to *italic*", () => {
    expect(htmlToMarkdown("<i>italic</i>")).toBe("*italic*");
  });

  it("converts <br> to newline", () => {
    expect(htmlToMarkdown("line1<br>line2")).toBe("line1\nline2");
  });

  it("converts <p> tags to paragraphs", () => {
    expect(htmlToMarkdown("<p>para1</p><p>para2</p>")).toBe("para1\n\npara2");
  });

  it("converts <a> to markdown link", () => {
    expect(htmlToMarkdown('<a href="https://example.com">link</a>')).toBe(
      "[link](https://example.com)",
    );
  });

  it("converts heading tags", () => {
    expect(htmlToMarkdown("<h2>Title</h2>")).toBe("## Title");
  });

  it("strips unknown tags", () => {
    expect(htmlToMarkdown("<div><span>text</span></div>")).toBe("text");
  });

  it("decodes HTML entities", () => {
    expect(htmlToMarkdown("&amp; &lt; &gt; &quot;")).toBe('& < > "');
  });

  it("trims whitespace", () => {
    expect(htmlToMarkdown("  <p>hello</p>  ")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("short", 150)).toBe("short");
  });

  it("truncates long text with ellipsis", () => {
    const long = "a".repeat(200);
    const result = truncate(long, 150);
    expect(result.length).toBeLessThanOrEqual(153); // 150 + "..."
    expect(result).toMatch(/\.\.\.$/);
  });

  it("returns exact-length text unchanged", () => {
    const exact = "a".repeat(150);
    expect(truncate(exact, 150)).toBe(exact);
  });

  it("uses default maxLen of 150", () => {
    const long = "a".repeat(200);
    expect(truncate(long)).toMatch(/\.\.\.$/);
  });
});

// ---------------------------------------------------------------------------
// formatItemMarkdown
// ---------------------------------------------------------------------------

describe("formatItemMarkdown", () => {
  const sampleItem: ZoteroItemData = {
    key: "ITEM1234",
    version: 5,
    itemType: "journalArticle",
    title: "Test Article",
    creators: [
      { creatorType: "author", firstName: "John", lastName: "Doe" },
      { creatorType: "editor", firstName: "Jane", lastName: "Smith" },
    ],
    date: "2024-01-15",
    DOI: "10.1234/test",
    url: "https://example.com",
    abstractNote: "A test abstract.",
    tags: [{ tag: "test" }, { tag: "science" }],
    collections: ["COL00001"],
  };

  it("includes title as heading", () => {
    const md = formatItemMarkdown(sampleItem);
    expect(md).toContain("## Test Article");
  });

  it("includes creators", () => {
    const md = formatItemMarkdown(sampleItem);
    expect(md).toContain("**Creators:** Doe, John; Smith, Jane (editor)");
  });

  it("includes DOI in backticks", () => {
    const md = formatItemMarkdown(sampleItem);
    expect(md).toContain("**DOI:** `10.1234/test`");
  });

  it("includes tags in backticks", () => {
    const md = formatItemMarkdown(sampleItem);
    expect(md).toContain("`test`");
    expect(md).toContain("`science`");
  });

  it("includes key and zotero link", () => {
    const md = formatItemMarkdown(sampleItem);
    expect(md).toContain("**Key:** `ITEM1234`");
    expect(md).toContain("zotero://select/library/items/ITEM1234");
  });

  it("formats note items with htmlToMarkdown", () => {
    const noteItem: ZoteroItemData = {
      key: "NOTE1234",
      version: 1,
      itemType: "note",
      note: "<p><strong>Bold</strong> text</p>",
      tags: [],
    };
    const md = formatItemMarkdown(noteItem);
    expect(md).toContain("## Note `NOTE1234`");
    expect(md).toContain("**Bold** text");
  });

  it("handles missing fields gracefully", () => {
    const minimal: ZoteroItemData = {
      key: "MIN12345",
      version: 1,
      itemType: "book",
    };
    const md = formatItemMarkdown(minimal);
    expect(md).toContain("## (no title)");
    expect(md).toContain("`MIN12345`");
  });
});

// ---------------------------------------------------------------------------
// formatItemSummary
// ---------------------------------------------------------------------------

describe("formatItemSummary", () => {
  it("uses h3 heading", () => {
    const md = formatItemSummary({
      key: "K1",
      version: 1,
      itemType: "journalArticle",
      title: "Title",
    });
    expect(md).toContain("### Title");
  });

  it("limits creators to 3 + et al.", () => {
    const md = formatItemSummary({
      key: "K1",
      version: 1,
      itemType: "journalArticle",
      title: "T",
      creators: [
        { creatorType: "author", firstName: "A", lastName: "One" },
        { creatorType: "author", firstName: "B", lastName: "Two" },
        { creatorType: "author", firstName: "C", lastName: "Three" },
        { creatorType: "author", firstName: "D", lastName: "Four" },
      ],
    });
    expect(md).toContain("et al.");
    expect(md).not.toContain("Four");
  });

  it("limits tags to 5 + ...", () => {
    const tags = Array.from({ length: 8 }, (_, i) => ({ tag: `tag${i}` }));
    const md = formatItemSummary({
      key: "K1",
      version: 1,
      itemType: "journalArticle",
      title: "T",
      tags,
    });
    expect(md).toContain("`tag4`");
    expect(md).toContain("...");
    expect(md).not.toContain("`tag5`");
  });

  it("truncates abstract", () => {
    const md = formatItemSummary({
      key: "K1",
      version: 1,
      itemType: "journalArticle",
      title: "T",
      abstractNote: "a".repeat(300),
    });
    expect(md).toContain("...");
  });

  it("formats note items compactly", () => {
    const md = formatItemSummary({
      key: "N1",
      version: 1,
      itemType: "note",
      note: "<p>Note content here</p>",
    });
    expect(md).toContain("### Note `N1`");
    expect(md).toContain("Note content here");
  });
});
