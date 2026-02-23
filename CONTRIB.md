# Contributing

Guidelines for contributing to zotero-mcp.

## Prerequisites

- Node.js >= 18
- npm
- A Zotero account with API key (for integration testing)

## Setup

```bash
git clone git@github-isezen:isezen/zotero-mcp.git
cd zotero-mcp
npm install
npm run build
npm test
```

## Project Structure

```
src/
├── index.ts           # MCP server entry point, tool definitions, transport setup
├── zotero-api.ts      # ZoteroClient class: all HTTP operations, rate limiting
├── utils.ts           # Shared utilities: HTML escaping, Markdown formatters
└── __tests__/
    ├── helpers.ts         # Test utilities: mock fetch, fixtures
    ├── utils.test.ts      # Utility function tests (39 tests)
    └── zotero-api.test.ts # ZoteroClient tests (45 tests)
```

## Development Workflow

1. Create a feature branch from `main`
2. Make changes in `src/`
3. Run `npm run build` to verify TypeScript compilation
4. Run `npm test` to ensure all 84 tests pass
5. Update `CHANGELOG.md` under `[Unreleased]`
6. Submit a pull request

## Code Conventions

- **Language:** TypeScript with strict mode (ES2022, Node16 modules)
- **Modules:** ES modules (`import`/`export`, no CommonJS)
- **Formatting:** No console.log — stdout is reserved for MCP protocol; use `console.error` for logging
- **Error handling:** All tool handlers use try-catch; errors return `{ isError: true }`
- **Types:** All types are defined and exported from `zotero-api.ts`
- **Parameters:** Tool parameters are validated with Zod schemas
- **HTML safety:** User input in HTML output must be escaped with `escapeHtml()`
- **Output format:** `get_item` and `search_items` return LLM-optimized Markdown

## Adding a New Tool

1. Define the tool in `src/index.ts` using `server.tool(name, description, schema, handler)`
2. If the tool needs a new API call, add a method to `ZoteroClient` in `src/zotero-api.ts`
3. Add Zod schema for parameters
4. Wrap the handler in try-catch
5. Add unit tests in `src/__tests__/`
6. Update the tool table in `CLAUDE.md` and `README.md`

## Testing

```bash
npm test                # Run all tests
npx vitest --watch      # Watch mode
npx vitest run utils    # Run only utils tests
```

Tests use mocked `fetch` — no real API calls are made. See `src/__tests__/helpers.ts`
for the mock setup.

## Dependencies

Do **not** add new dependencies without approval. The project deliberately has
minimal dependencies:

- `@modelcontextprotocol/sdk` — MCP protocol
- `zod` — schema validation (SDK peer dependency)

No HTTP client libraries — Node 18+ built-in `fetch` is used.

## Git Identity

This repo uses [git-guard](https://github.com/isezen/git-guard) for identity
enforcement. Pre-commit and pre-push hooks validate email and remote URL.

```bash
make guard        # Install hooks + create policy
make guard-status # Check git identity status
```

## Release

```bash
npm run build
npm test
npm version <major|minor|patch>
npm publish --access public
```
