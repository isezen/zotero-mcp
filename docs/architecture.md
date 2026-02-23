# Architecture

Technical architecture of the zotero-mcp server.

## Overview

```
┌─────────────────────────────────────────────────┐
│  MCP Client (Claude Desktop / Code / other)     │
└─────────────────┬───────────────────────────────┘
                  │ stdio or SSE
┌─────────────────▼───────────────────────────────┐
│  index.ts — MCP Server                          │
│  ┌─────────────────────────────────────────┐    │
│  │  9 Tool Handlers (Zod-validated params) │    │
│  └──────────────────┬──────────────────────┘    │
│                     │                           │
│  ┌──────────────────▼──────────────────────┐    │
│  │  utils.ts — Markdown formatters,        │    │
│  │             escapeHtml                  │    │
│  └─────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  zotero-api.ts — ZoteroClient                   │
│  ┌─────────────────────────────────────────┐    │
│  │  rateLimitedFetch() — 1 req/sec         │    │
│  │  Backoff / Retry-After handling         │    │
│  └──────────────────┬──────────────────────┘    │
│                     │                           │
│  ┌──────────────────▼──────────────────────┐    │
│  │  Local file access (~/Zotero/storage)   │    │
│  └─────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────┘
                  │ HTTP (fetch)
┌─────────────────▼───────────────────────────────┐
│  Zotero API v3                                  │
│  - Web API: api.zotero.org                      │
│  - Local API: localhost:23119 (Desktop)         │
└─────────────────────────────────────────────────┘
```

## Modules

### `index.ts` — MCP Server

Entry point. Responsibilities:
- Environment variable validation
- ZoteroClient initialization
- 9 tool definitions with Zod parameter schemas
- Transport selection (stdio vs SSE)
- SSE: HTTP server with session management

### `zotero-api.ts` — ZoteroClient

HTTP client for Zotero API v3. Responsibilities:
- Rate-limited fetch (1 request/second minimum interval)
- Automatic Backoff/Retry-After header handling
- All CRUD operations (collections, items, notes)
- Attachment download (local file or API)
- Full-text content retrieval (local cache or API)
- Configurable for Web API, Local API, user/group libraries

### `utils.ts` — Utilities

Shared helper functions:
- `escapeHtml()` — sanitize user input for HTML output
- `formatCreator()` — format Zotero creator for display
- `htmlToMarkdown()` — convert Zotero note HTML to Markdown
- `truncate()` — text truncation with ellipsis
- `formatItemMarkdown()` — full item detail in Markdown
- `formatItemSummary()` — compact item summary for search results

## Transport Modes

### stdio (default)

Standard MCP transport. JSON-RPC messages over stdin/stdout.
Used by Claude Code and Claude Desktop.

### SSE (Server-Sent Events)

HTTP-based transport for remote/Docker deployments.

```
Client                     Server (port 3000)
  │                            │
  │── GET /sse ───────────────►│  New SSEServerTransport
  │◄── SSE event stream ──────│  (sessionId assigned)
  │                            │
  │── POST /messages?sid=X ───►│  handlePostMessage()
  │◄── SSE response ──────────│
```

Multiple clients can connect simultaneously (session map).

## Data Flow: Local-First Strategy

For `get_item_fulltext` and `read_attachment`, the server uses a local-first
approach when Zotero Desktop storage is available:

```
Request
  │
  ├─► Check ZOTERO_DATA_DIR/storage/{key}/
  │   ├─ Found → Read local file (fast, no API call)
  │   └─ Not found ─┐
  │                  │
  └──────────────────┴─► Fetch from Zotero API (fallback)
```

`ZOTERO_DATA_DIR` defaults to `~/Zotero`. The full-text cache is read from
`.zotero-ft-cache` files inside each item's storage directory.

## Configuration Matrix

| Mode | API Key | Library ID | Base URL |
|------|---------|------------|----------|
| Web API (user) | Required | Required | `api.zotero.org` |
| Web API (group) | Required | Required | `api.zotero.org` (uses `/groups/` prefix) |
| Local API | Not needed | Optional (default: `0`) | `127.0.0.1:23119/api` |

## Tool Output Formats

| Tool | Output Format |
|------|--------------|
| `list_collections` | JSON |
| `create_collection` | JSON |
| `create_note` | JSON |
| `add_note_to_collection` | JSON |
| `get_item` | LLM-optimized Markdown (full detail) |
| `search_items` | LLM-optimized Markdown (compact summaries) |
| `get_item_attachments` | JSON (attachment list) |
| `get_item_fulltext` | Plain text (full-text content) |
| `read_attachment` | Text (local path) or base64 (API download) |

## Design Decisions

1. **No HTTP client library** — Node 18+ built-in `fetch` keeps dependencies
   minimal and avoids bloat.

2. **Rate limiting in client** — Centralized `rateLimitedFetch()` ensures
   all API calls respect Zotero's 1 req/sec limit regardless of tool usage.

3. **LLM-optimized Markdown** — `get_item` and `search_items` return structured
   Markdown instead of JSON because LLMs process formatted text more efficiently.
   Write-oriented tools keep JSON for structured responses.

4. **Local-first file access** — When Zotero Desktop storage is available,
   reading files locally avoids API calls and base64 encoding overhead.

5. **SSE over Streamable HTTP** — SSE transport is used for Docker compatibility.
   The MCP SDK's SSEServerTransport provides a stable, well-tested implementation.
