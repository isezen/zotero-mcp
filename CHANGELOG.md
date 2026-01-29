# Changelog

## [Unreleased]

### Added

- 3 new MCP tools for PDF/attachment access:
  - `get_item_attachments` — list attachments with local path detection
  - `get_item_fulltext` — full-text content (local cache → API fallback)
  - `read_attachment` — read file (local path → API base64 download)
- 3 new `ZoteroClient` methods: `getItemChildren`, `getFullText`,
  `downloadAttachment`
- Type definitions: `ZoteroAttachmentData`, `ZoteroFullText`, `AttachmentInfo`
- `ZOTERO_DATA_DIR` env variable for local Zotero storage (default: `~/Zotero`)
- Unit test suite with Vitest (45 tests)
  - `escapeHtml` utility tests (7 tests)
  - `ZoteroClient` tests with fetch mocking (38 tests)
- `src/utils.ts` — extracted `escapeHtml` for testability
- `npm test` script

### Changed

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
