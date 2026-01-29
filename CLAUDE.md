# zotero-mcp

Zotero Web API v3 üzerinden çalışan TypeScript MCP sunucusu.
npm paketi olarak dağıtılır: `npx -y zotero-mcp`

## Proje Yapısı

```
src/
├── index.ts          # MCP server: tool tanımları, env kontrol, stdio transport
├── zotero-api.ts     # ZoteroClient sınıfı: rate limiting, tüm HTTP işlemleri
├── utils.ts          # Utility fonksiyonlar (escapeHtml)
└── __tests__/        # Vitest unit testleri
```

- `dist/` → TypeScript build çıktısı (git'e dahil değil)
- `node_modules/` → bağımlılıklar (git'e dahil değil)

## Teknoloji

- **Dil:** TypeScript (ES2022, Node16 modül)
- **Çalışma zamanı:** Node.js >= 18 (built-in `fetch` kullanılır)
- **Paket tipi:** ES modules (`"type": "module"`)
- **Transport:** stdio (JSON-RPC over stdin/stdout)

## Bağımlılıklar

| Paket | Amaç |
|-------|------|
| `@modelcontextprotocol/sdk` | MCP protokolü (McpServer, StdioServerTransport) |
| `zod` | Tool parametre şema doğrulama (SDK peer dep) |
| `typescript` (dev) | Derleyici |
| `@types/node` (dev) | Node.js tip tanımları |
| `vitest` (dev) | Test framework |

**Ek HTTP istemci YOK** — Node 18+ `fetch` API'si kullanılır.

## MCP Tools (8 adet)

| Tool | HTTP | Açıklama |
|------|------|----------|
| `list_collections` | GET /collections | Koleksiyonları listele (pagination) |
| `create_collection` | POST /collections | Yeni koleksiyon oluştur |
| `create_note` | POST /items | Standalone not oluştur (şablon opsiyonel) |
| `add_note_to_collection` | GET + PATCH /items | Öğeyi koleksiyona ekle |
| `search_items` | GET /items?q=... | Öğe ara (başlık/yazar/tam metin) |
| `get_item_attachments` | GET /items/{key}/children | Ekleri listele (local path tespiti) |
| `get_item_fulltext` | Local cache / GET /fulltext | Tam metin içerik (local-first) |
| `read_attachment` | Local FS / GET /items/{key}/file | Dosya oku (local path veya API download) |

## Ortam Değişkenleri

**Zorunlu:**
```
ZOTERO_API_KEY      — Zotero API anahtarı
ZOTERO_LIBRARY_ID   — Zotero kullanıcı kütüphane ID'si
```

**Opsiyonel:**
```
ZOTERO_DATA_DIR     — Local Zotero veri dizini (default: ~/Zotero)
```

Koda gömülü API key veya library ID **OLMAMALI**.

## Build & Test

```bash
# Build
npm run build          # tsc && chmod 755 dist/index.js

# Unit testler
npm test               # vitest run (45 test)

# MCP Inspector ile test
ZOTERO_API_KEY=xxx ZOTERO_LIBRARY_ID=yyy \
  npx @modelcontextprotocol/inspector dist/index.js

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
