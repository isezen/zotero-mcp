# zotero-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for
the [Zotero Web API v3](https://www.zotero.org/support/dev/web_api/v3/basics).
Manage collections, create notes, and search items in your Zotero library
directly from Claude (Desktop, Code, or any MCP-compatible client).

## Requirements

- **Node.js >= 18** (for built-in `fetch` support)
- A [Zotero API key](https://www.zotero.org/settings/keys) with read/write access
- Your Zotero user library ID (visible at <https://www.zotero.org/settings/keys>)

## Quick Start

### Claude Code

```bash
claude mcp add zotero \
  --env ZOTERO_API_KEY=your_api_key \
  --env ZOTERO_LIBRARY_ID=your_library_id \
  -- npx -y zotero-mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "zotero": {
      "command": "npx",
      "args": ["-y", "zotero-mcp"],
      "env": {
        "ZOTERO_API_KEY": "your_api_key",
        "ZOTERO_LIBRARY_ID": "your_library_id"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Environment Variables

| Variable            | Required | Description                                    |
| ------------------- | -------- | ---------------------------------------------- |
| `ZOTERO_API_KEY`    | Yes      | Zotero API key                                 |
| `ZOTERO_LIBRARY_ID` | Yes      | Zotero user library ID                         |
| `ZOTERO_DATA_DIR`   | No       | Local Zotero data directory (default: ~/Zotero) |

## Available Tools

### `list_collections`

List all collections in the library with pagination.

| Parameter | Type   | Default | Description                  |
| --------- | ------ | ------- | ---------------------------- |
| `limit`   | number | 25      | Max results (1–100)          |
| `offset`  | number | 0       | Offset for pagination        |

### `create_collection`

Create a new collection (or sub-collection).

| Parameter          | Type   | Required | Description                          |
| ------------------ | ------ | -------- | ------------------------------------ |
| `name`             | string | Yes      | Collection name                      |
| `parentCollection` | string | No       | Parent collection key (for nesting)  |

### `create_note`

Create a standalone note with optional Zotero HTML template.

| Parameter        | Type     | Default | Description                                 |
| ---------------- | -------- | ------- | ------------------------------------------- |
| `title`          | string   | —       | Note title (required)                       |
| `content`        | string   | —       | Note body as HTML (required)                |
| `collectionKeys` | string[] | —       | Add the note to these collections           |
| `tags`           | string[] | —       | Tags for the note                           |
| `useTemplate`    | boolean  | true    | Wrap in Zotero note template with metadata  |

### `add_note_to_collection`

Add an existing item to a collection.

| Parameter       | Type   | Required | Description                  |
| --------------- | ------ | -------- | ---------------------------- |
| `itemKey`       | string | Yes      | Item key (8-character)       |
| `collectionKey` | string | Yes      | Target collection key        |

### `search_items`

Search for items by title, creator, year, or full text.

| Parameter   | Type   | Default            | Description                          |
| ----------- | ------ | ------------------ | ------------------------------------ |
| `query`     | string | —                  | Search query (required)              |
| `qmode`     | string | titleCreatorYear   | `titleCreatorYear` or `everything`   |
| `itemType`  | string | —                  | Filter: `journalArticle`, `book`…    |
| `sort`      | string | dateModified       | Sort field                           |
| `direction` | string | desc               | `asc` or `desc`                      |
| `limit`     | number | 25                 | Max results (1–100)                  |
| `offset`    | number | 0                  | Offset for pagination                |

### `get_item_attachments`

List attachments (PDFs, snapshots, etc.) for a Zotero item. Detects local file paths when Zotero Desktop storage is available.

| Parameter     | Type    | Required | Description                                      |
| ------------- | ------- | -------- | ------------------------------------------------ |
| `itemKey`     | string  | Yes      | Parent item key                                  |
| `forceRemote` | boolean | No       | Skip local detection, API-only info (default: false) |

### `get_item_fulltext`

Get full-text content of an item. Checks local Zotero cache first (`.zotero-ft-cache`), falls back to the Zotero API fulltext endpoint.

| Parameter     | Type    | Required | Description                                      |
| ------------- | ------- | -------- | ------------------------------------------------ |
| `itemKey`     | string  | Yes      | Attachment or parent item key                    |
| `forceRemote` | boolean | No       | Skip local cache, fetch from API (default: false) |

### `read_attachment`

Read an attachment file. Returns the local file path (when Zotero Desktop storage is available) or downloads via API as base64. Auto-resolves parent item keys to their first PDF attachment.

| Parameter     | Type    | Required | Description                                          |
| ------------- | ------- | -------- | ---------------------------------------------------- |
| `itemKey`     | string  | Yes      | Attachment or parent item key                        |
| `forceRemote` | boolean | No       | Skip local file, download from API (default: false)  |

## Development

```bash
git clone https://github.com/isezen/zotero-mcp.git
cd zotero-mcp
npm install
npm run build
npm test              # 45 unit tests (Vitest)
```

### Test with MCP Inspector

```bash
ZOTERO_API_KEY=your_key ZOTERO_LIBRARY_ID=your_id \
  npx @modelcontextprotocol/inspector dist/index.js
```

### Test locally with Claude Code

```bash
claude mcp add zotero-dev \
  --env ZOTERO_API_KEY=your_key \
  --env ZOTERO_LIBRARY_ID=your_id \
  -- node /absolute/path/to/zotero-mcp/dist/index.js
```

## Rate Limiting

The server enforces a minimum interval of 1 second between API requests and
automatically respects `Backoff` and `Retry-After` headers returned by Zotero.

## License

[MIT](LICENSE.md)
