# Changelog

## [Unreleased]

### Added — Tools

- `get_item` MCP tool — retrieve single item with full metadata (9 tools total)
- `get_item_attachments` — list attachments with local path detection
- `get_item_fulltext` — full-text content (local cache → API fallback)
- `read_attachment` — read file (local path → API base64 download)
- `tag` parameter for `search_items` — filter by tag with boolean syntax
  (`tag1 || tag2`, `-excludeTag`)
- `forceRemote` parameter for `get_item_attachments`, `get_item_fulltext`,
  and `read_attachment` — bypasses local storage and fetches from the API

### Added — Features

- Zotero Local API support (`ZOTERO_LOCAL=true`) — connect to Zotero Desktop
  at `localhost:23119` without API key
- Group library support (`ZOTERO_LIBRARY_TYPE=group`) — access group libraries
  in addition to user libraries
- LLM-optimized Markdown output for `get_item` and `search_items` tools —
  structured headings, formatted creators, backtick-wrapped keys/tags
- SSE transport support (`--transport sse --port 3000`) — HTTP-based transport
  for Docker and remote access
- `ZOTERO_DATA_DIR` env variable for local Zotero storage (default: `~/Zotero`)

### Added — Infrastructure

- `Dockerfile` with multi-stage build for containerized deployment
- `.dockerignore` for efficient Docker builds
- Markdown helper functions in `utils.ts`: `formatCreator`, `htmlToMarkdown`,
  `truncate`, `formatItemMarkdown`, `formatItemSummary`
- 3 new `ZoteroClient` methods: `getItemChildren`, `getFullText`,
  `downloadAttachment`
- Type definitions: `ZoteroAttachmentData`, `ZoteroFullText`, `AttachmentInfo`
- `src/utils.ts` — extracted `escapeHtml` and added Markdown formatting helpers
- Unit test suite with Vitest (84 tests)
  - Utility function tests: escapeHtml, formatCreator, htmlToMarkdown,
    truncate, formatItemMarkdown, formatItemSummary (39 tests)
  - `ZoteroClient` tests including local API, group library, tag search (45 tests)
- `npm test` script
- `CONTRIB.md` — contribution guidelines
- `docs/architecture.md` — technical architecture document

### Changed

- `search_items` output changed from JSON to LLM-optimized Markdown format
- `ZoteroConfig` extended with `libraryType` and `isLocal` options
- `downloadAttachment()` now uses centralized `headers()` method
- `escapeHtml` moved from `index.ts` to `src/utils.ts`
- `tsconfig.json` excludes `src/__tests__/` from build output

## [1.0.0] - 2026-01-29

### Added

- Initial release
- 5 MCP tools: `list_collections`, `create_collection`, `create_note`,
  `add_note_to_collection`, `search_items`
- Zotero Web API v3 client with rate limiting (1 req/sec)
- Automatic Backoff / Retry-After handling
- Pagination support for list and search operations
- Zotero-compatible HTML note template
- HTML escaping for note titles
- Descriptive error messages based on HTTP status codes
