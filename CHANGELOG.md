# Changelog

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
