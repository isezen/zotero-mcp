/**
 * Shared utility functions: HTML escaping, Markdown formatting helpers.
 */

import type { ZoteroCreator, ZoteroItemData } from "./zotero-api.js";

/** Escape HTML special characters in user-provided text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format a ZoteroCreator for display (e.g. "Doe, John" or "Doe, John (editor)"). */
export function formatCreator(c: ZoteroCreator): string {
  if (c.name) return c.name;
  const name = [c.lastName, c.firstName].filter(Boolean).join(", ");
  return c.creatorType !== "author" ? `${name} (${c.creatorType})` : name;
}

/** Convert basic Zotero note HTML to Markdown. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<p>/gi, "")
    .replace(/<\/p>/gi, "")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<h(\d)>(.*?)<\/h\d>/gi, (_m, level: string, text: string) =>
      "#".repeat(Number(level)) + " " + text,
    )
    .replace(/<\/?[^>]+>/g, "") // strip remaining tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/** Truncate text to maxLen characters, appending "..." if truncated. */
export function truncate(text: string, maxLen = 150): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).trimEnd() + "...";
}

/** Format a Zotero item as full Markdown for LLM consumption. */
export function formatItemMarkdown(data: ZoteroItemData): string {
  const lines: string[] = [];

  // Note items
  if (data.itemType === "note") {
    const preview = data.note ? htmlToMarkdown(data.note) : "(empty note)";
    lines.push(`## Note \`${data.key}\``);
    lines.push("");
    if (data.tags?.length) {
      lines.push(`**Tags:** ${data.tags.map((t) => `\`${t.tag}\``).join(", ")}`);
    }
    lines.push("");
    lines.push(preview);
    return lines.join("\n");
  }

  // Regular items
  lines.push(`## ${data.title ?? "(no title)"}`);
  lines.push("");
  if (data.creators?.length) {
    lines.push(`**Creators:** ${data.creators.map(formatCreator).join("; ")}`);
  }
  if (data.date) lines.push(`**Date:** ${data.date}`);
  if (data.itemType) lines.push(`**Type:** ${data.itemType}`);
  if (data.DOI) lines.push(`**DOI:** \`${data.DOI}\``);
  if (data.url) lines.push(`**URL:** ${data.url}`);
  if (data.tags?.length) {
    lines.push(`**Tags:** ${data.tags.map((t) => `\`${t.tag}\``).join(", ")}`);
  }
  if (data.collections?.length) {
    lines.push(`**Collections:** ${data.collections.map((c) => `\`${c}\``).join(", ")}`);
  }
  if (data.abstractNote) {
    lines.push("");
    lines.push(`**Abstract:** ${data.abstractNote}`);
  }
  lines.push("");
  lines.push(`**Key:** \`${data.key}\` | **Link:** zotero://select/library/items/${data.key}`);

  return lines.join("\n");
}

/** Format a Zotero item as a compact summary (for search results). */
export function formatItemSummary(data: ZoteroItemData): string {
  const lines: string[] = [];

  // Note items — compact preview
  if (data.itemType === "note") {
    const preview = data.note
      ? truncate(htmlToMarkdown(data.note), 150)
      : "(empty note)";
    lines.push(`### Note \`${data.key}\``);
    lines.push(preview);
    return lines.join("\n");
  }

  // Regular items
  const title = data.title ?? "(no title)";
  lines.push(`### ${title}`);

  const parts: string[] = [];
  if (data.creators?.length) {
    const creators = data.creators.slice(0, 3).map(formatCreator);
    if (data.creators.length > 3) creators.push("et al.");
    parts.push(`**Creators:** ${creators.join("; ")}`);
  }
  if (data.date) parts.push(`**Date:** ${data.date}`);
  if (data.itemType) parts.push(`**Type:** ${data.itemType}`);
  if (parts.length) lines.push(parts.join(" | "));

  if (data.tags?.length) {
    const tags = data.tags.slice(0, 5).map((t) => `\`${t.tag}\``);
    if (data.tags.length > 5) tags.push("...");
    lines.push(`**Tags:** ${tags.join(", ")}`);
  }
  if (data.abstractNote) {
    lines.push(`**Abstract:** ${truncate(data.abstractNote, 150)}`);
  }
  lines.push(`**Key:** \`${data.key}\``);

  return lines.join("\n");
}
