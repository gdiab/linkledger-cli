# linkledger-cli

CLI-first personal knowledge capture and retrieval for human+agent workflows. Save URLs, ingest content, annotate, tag, search, and brief -- all from the terminal.

## Tech Stack

- **Runtime**: Node.js >= 22 (ESM-only, `"type": "module"`)
- **Language**: TypeScript 5.8, strict mode, `ES2022` target, `NodeNext` module resolution
- **Database**: SQLite via `better-sqlite3` with WAL mode, FTS5 for full-text search
- **CLI framework**: Commander
- **Tests**: Node built-in test runner (`node:test`) with `node:assert/strict`
- **Build**: `tsc` to `dist/`, dev runner via `tsx`

## Architecture

```
src/
  cli/index.ts        -- Commander entry point, all commands registered here
  adapters/           -- Source-specific fetch+parse (article, youtube, x, pdf, bluesky, linkedin)
  db/database.ts      -- SQLite connection, migration runner
  repositories/       -- One class per table, raw SQL queries, typed inputs/outputs
  services/           -- Business logic orchestrating repositories + adapters
  lib/                -- Shared types, error handling, ID generation, URL utils, output formatting
db/migrations/        -- Sequential .sql migration files (001_init.sql, etc.)
test/
  unit/               -- Adapter and utility tests (mock fetch, no DB)
  integration/        -- Full-stack tests using withTempDb helper (real SQLite)
  helpers/temp-db.ts  -- Creates ephemeral DB via LINKLEDGER_DB_PATH env var
```

**Layering**: CLI -> Services -> Repositories -> Database. Adapters are called by services (ingest worker). Services receive a `ServiceContext` containing all repositories and the DB handle.

## Conventions

- All imports use explicit `.js` extensions (NodeNext resolution)
- IDs are deterministic where possible (`itemIdFromCanonicalUrl`) or randomish (`createRandomishId`)
- Dates are ISO 8601 strings, generated via `nowIso()`
- SQL uses named parameters (`@param`) with `better-sqlite3` bindings
- Transactions use `db.transaction()` for multi-statement atomicity
- Errors use `AppError(code, message, retryable)` -- retryable flag controls job retry behavior
- JSON output uses `{ ok: true, data }` / `{ ok: false, error }` envelope pattern
- Tests mock `globalThis.fetch` directly (no libraries), restore in `finally`
- Test concurrency is disabled (`--test-concurrency=1`) because tests share process-level env vars

## Review Guidelines

### SQL Safety
- All user input MUST go through named parameters (`@param`) -- never interpolate into SQL strings
- Dynamic IN clauses use indexed params (`@tag0`, `@tag1`, ...) built from arrays
- FTS5 queries go through `toFtsQuery()` which sanitizes tokens before MATCH
- Watch for SQL injection in any new query code

### Adapter Contract
- Every adapter implements `SourceAdapter` interface: `supports()`, `detectType()`, `fetchAndParse()`
- `fetchAndParse` must return `AdapterParseResult` with metadata, chunks, checksum, fetchedAt
- Non-retryable parse failures use `AppError(..., false)`, transient network errors use `AppError(..., true)`
- New adapters need a corresponding unit test with mocked fetch

### FTS5 Usage
- The `search_fts` virtual table indexes `title`, `chunk_text`, `annotation_text` with `item_id UNINDEXED`
- BM25 weights are `(2.5, 1.0, 2.0)` for title, chunk, annotation columns
- Ranking combines BM25 + pinned boost - low-confidence penalty
- Any changes to FTS schema require a new numbered migration

### Data Integrity
- Foreign keys are enforced (`PRAGMA foreign_keys = ON`)
- Items have a unique constraint on `canonical_url`
- Tags have a unique constraint on `(item_id, tag, actor)`
- Content chunks have a unique constraint on `(item_id, chunk_index)`
- Migrations are sequential and idempotent (use `IF NOT EXISTS`)

### Testing
- Unit tests go in `test/unit/`, integration tests in `test/integration/`
- Integration tests must use `withTempDb()` for isolation
- Always restore global state (`globalThis.fetch`, env vars) in `finally` blocks
- Run `npm test` and `npm run typecheck` before approving
