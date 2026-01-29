/**
 * Unit tests for the escapeHtml utility function.
 */

import { describe, it, expect } from "vitest";
import { escapeHtml } from "../utils.js";

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
