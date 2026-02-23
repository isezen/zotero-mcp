# zotero-mcp

Zotero Web API v3 üzerinden çalışan TypeScript MCP sunucusu.
npm paketi olarak dağıtılır: `npx -y zotero-mcp`

## Proje Yapısı

```
src/
├── index.ts          # MCP server: 9 tool tanımı, env kontrol, stdio + SSE transport
├── zotero-api.ts     # ZoteroClient sınıfı: rate limiting, tüm HTTP işlemleri
├── utils.ts          # Utility fonksiyonlar (escapeHtml, Markdown formatters)
└── __tests__/        # Vitest unit testleri (84 test)
    ├── helpers.ts        # Test yardımcıları (mock fetch, fixtures)
    ├── utils.test.ts     # Utility fonksiyon testleri (39 test)
    └── zotero-api.test.ts # ZoteroClient testleri (45 test)
```

- `dist/` → TypeScript build çıktısı (git'e dahil değil)
- `node_modules/` → bağımlılıklar (git'e dahil değil)
- `Dockerfile` → Multi-stage Docker build (SSE transport)
- `docs/` → Teknik dokümanlar

## Teknoloji

- **Dil:** TypeScript (ES2022, Node16 modül)
- **Çalışma zamanı:** Node.js >= 18 (built-in `fetch` kullanılır)
- **Paket tipi:** ES modules (`"type": "module"`)
- **Transport:** stdio (default) veya SSE (`--transport sse --port 3000`)

## Bağımlılıklar

| Paket | Amaç |
|-------|------|
| `@modelcontextprotocol/sdk` | MCP protokolü (McpServer, StdioServerTransport) |
| `zod` | Tool parametre şema doğrulama (SDK peer dep) |
| `typescript` (dev) | Derleyici |
| `@types/node` (dev) | Node.js tip tanımları |
| `vitest` (dev) | Test framework |

**Ek HTTP istemci YOK** — Node 18+ `fetch` API'si kullanılır.

## MCP Tools (9 adet)

| Tool | HTTP | Açıklama |
|------|------|----------|
| `list_collections` | GET /collections | Koleksiyonları listele (pagination) |
| `create_collection` | POST /collections | Yeni koleksiyon oluştur |
| `create_note` | POST /items | Standalone not oluştur (şablon opsiyonel) |
| `add_note_to_collection` | GET + PATCH /items | Öğeyi koleksiyona ekle |
| `get_item` | GET /items/{key} | Tek öğe metadata (Markdown çıktı) |
| `search_items` | GET /items?q=... | Öğe ara (tag filtre, Markdown çıktı) |
| `get_item_attachments` | GET /items/{key}/children | Ekleri listele (local path tespiti) |
| `get_item_fulltext` | Local cache / GET /fulltext | Tam metin içerik (local-first) |
| `read_attachment` | Local FS / GET /items/{key}/file | Dosya oku (local path veya API download) |

## Ortam Değişkenleri

**Zorunlu** (ZOTERO_LOCAL=true değilse):
```
ZOTERO_API_KEY      — Zotero API anahtarı
ZOTERO_LIBRARY_ID   — Zotero kullanıcı/grup kütüphane ID'si
```

**Opsiyonel:**
```
ZOTERO_DATA_DIR     — Local Zotero veri dizini (default: ~/Zotero)
ZOTERO_LOCAL        — Zotero Desktop local API modu (default: false)
ZOTERO_LIBRARY_TYPE — "user" (default) veya "group"
```

Koda gömülü API key veya library ID **OLMAMALI**.

## Build & Test

```bash
# Build
npm run build          # tsc && chmod 755 dist/index.js

# Unit testler
npm test               # vitest run (84 test)

# MCP Inspector ile test
ZOTERO_API_KEY=xxx ZOTERO_LIBRARY_ID=yyy \
  npx @modelcontextprotocol/inspector dist/index.js

# SSE transport testi
ZOTERO_API_KEY=xxx ZOTERO_LIBRARY_ID=yyy \
  node dist/index.js --transport sse --port 3000

# Docker build & run
docker build -t zotero-mcp .
docker run -p 3000:3000 -e ZOTERO_API_KEY=xxx -e ZOTERO_LIBRARY_ID=yyy zotero-mcp

# Claude Code'a local ekle
claude mcp add zotero-dev \
  --env ZOTERO_API_KEY=xxx \
  --env ZOTERO_LIBRARY_ID=yyy \
  -- node dist/index.js
```

## Zotero API Kuralları

- **Rate limit:** 1 istek/saniye → `rateLimitedFetch()` merkezi kontrol
- **Backoff/Retry-After:** Header'lar otomatik okunur
- **Write Token:** Her POST/PATCH'te `Zotero-Write-Token: crypto.randomUUID()`
- **Version kontrolü:** PATCH'te `If-Unmodified-Since-Version` header zorunlu
- **API versiyon:** `Zotero-API-Version: 3` her istekte gönderilir

## Kod Kuralları

- **console.log YASAK** — stdout MCP protokolüne ayrılmış, log için `console.error`
- Tool handler'lar `try-catch` ile sarılır, hata → `{ isError: true }`
- HTML çıktıda kullanıcı girdisi `escapeHtml()` ile temizlenir
- Tüm tipler `zotero-api.ts`'de tanımlı ve export edilir
- Tool parametreleri `zod` şema ile tanımlanır
- `get_item` ve `search_items` çıktısı LLM-optimized Markdown formatında
- Markdown helper'lar `utils.ts`'de: `formatCreator`, `htmlToMarkdown`,
  `truncate`, `formatItemMarkdown`, `formatItemSummary`

## Git & Guard

```bash
make guard             # Hook kur + policy oluştur + doctor çalıştır
make guard-status      # Git durumunu göster
make build             # npm run build
make clean             # dist/ temizle
```

**Hooks (STRICT=1):**
- `pre-commit` → email doğrulama (`613356+isezen@users.noreply.github.com`)
- `pre-push` → origin doğrulama (`git@github-isezen:isezen/zotero-mcp.git`)

**Policy:** `.git-identity-guard` dosyası (repo root'ta)

## npm Publish

```bash
npm login
npm publish --access public
# Sonra: npx -y zotero-mcp
```

## Entegrasyon

**Claude Code:**
```bash
claude mcp add zotero \
  --env ZOTERO_API_KEY=xxx \
  --env ZOTERO_LIBRARY_ID=yyy \
  -- npx -y zotero-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "zotero": {
      "command": "npx",
      "args": ["-y", "zotero-mcp"],
      "env": {
        "ZOTERO_API_KEY": "xxx",
        "ZOTERO_LIBRARY_ID": "yyy"
      }
    }
  }
}
```
