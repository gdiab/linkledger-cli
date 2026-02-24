# linkledger-cli Technical Specification (v0)

## 1. Purpose
This document translates the PRD into an implementation-ready design for v1 (CLI-first, local-first, single-user with multiple agents).

## 2. Scope
### In scope
- CLI for save, find, annotate, tag, brief, related, status, retry.
- Local SQLite store with FTS5 lexical search.
- Async ingestion pipeline with explicit states.
- Source adapters for article first, then X/YouTube/PDF.
- JSON output contract for agent integration.

### Out of scope (v1)
- Multi-user auth and permissions.
- Hosted service and sync.
- Full web UI.
- Semantic embeddings in the first implementation.

## 3. Proposed Stack
- Language/runtime: TypeScript on Node.js 22+.
- CLI framework: `commander`.
- SQLite driver: `better-sqlite3`.
- Queue/background jobs: local SQLite-backed job table + worker loop.
- HTML/article extraction: `@mozilla/readability` + `jsdom`.
- PDF extraction: adapter abstraction (exact library selected in M2).
- Logging: structured JSON logs to stdout/stderr.
- Packaging: npm package exposing CLI binary.

## 4. Architecture
### 4.1 Components
1. CLI command layer
- Validates input, calls application services, formats output.

2. Application services
- `SaveService`, `IngestService`, `AnnotationService`, `SearchService`, `BriefService`.

3. Adapter layer
- `FetchAdapter`, `ArticleAdapter`, `XAdapter`, `YouTubeAdapter`, `PdfAdapter`.

4. Storage layer
- SQLite access with repositories and migrations.
- FTS5 index maintenance.

5. Worker loop
- Pulls queued ingest tasks.
- Transitions item status and persists parse/enrichment artifacts.

### 4.2 Data flow
1. `save` inserts item with `metadata_saved` and enqueues ingest job.
2. Worker fetches/normalizes text and writes chunks.
3. Worker updates status to `parsed`.
4. Optional enrichment writes summary/key claims and sets `enriched`.
5. `find` and `brief` query FTS + relational filters and return ranked compact output.

## 5. Persistence Design

## 5.1 SQLite pragmas
- `PRAGMA journal_mode=WAL;`
- `PRAGMA synchronous=NORMAL;`
- `PRAGMA busy_timeout=5000;`

## 5.2 Schema (initial)
```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  author TEXT,
  published_at TEXT,
  fetched_at TEXT,
  ingest_status TEXT NOT NULL,
  ingest_error TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE content_chunks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(item_id, chunk_index)
);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_id TEXT REFERENCES content_chunks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  actor TEXT NOT NULL,
  confidence REAL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(item_id, tag, actor)
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  summary TEXT,
  key_claims_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ingest_jobs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 5.3 Indexes
```sql
CREATE INDEX idx_items_source_fetched ON items(source_type, fetched_at);
CREATE INDEX idx_items_status ON items(ingest_status);
CREATE INDEX idx_annotations_item_type_created ON annotations(item_id, type, created_at);
CREATE INDEX idx_tags_tag_item ON tags(tag, item_id);
CREATE INDEX idx_chunks_item_index ON content_chunks(item_id, chunk_index);
```

## 5.4 Full-text search
```sql
CREATE VIRTUAL TABLE search_fts USING fts5(
  item_id UNINDEXED,
  title,
  chunk_text,
  annotation_text,
  tokenize='porter unicode61'
);
```

- Rebuild strategy: trigger-based updates for M1, fallback periodic reconcile command for recovery.
- Ranking approach:
  - `score = bm25(search_fts, 2.5, 1.0, 2.0)`
  - Apply boosts/penalties:
    - boost if annotation pinned
    - penalty for agent confidence < 0.6

## 6. CLI Contract
### 6.1 Commands
- `linkledger save <url> [--note] [--tags] [--json]`
- `linkledger annotate <item-id> --highlight|--lowlight|--note <text> [--actor] [--confidence] [--json]`
- `linkledger tag <item-id> --add <tags> [--actor] [--json]`
- `linkledger find <query> [--tags] [--type] [--since] [--limit] [--json]`
- `linkledger brief <query> [--max-items] [--expand-chunks] [--json]`
- `linkledger related <item-id> [--max-items] [--json]`
- `linkledger status <item-id> [--json]`
- `linkledger retry <item-id> [--json]`

### 6.2 Output contract (JSON)
Common envelope:
```json
{
  "ok": true,
  "data": {},
  "meta": {
    "timestamp": "2026-02-24T17:00:00Z",
    "version": "0.1.0"
  }
}
```

Error envelope:
```json
{
  "ok": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No item found for id abc123",
    "retryable": false
  }
}
```

## 7. Ingestion State Machine
Allowed transitions:
- `metadata_saved -> parsed`
- `metadata_saved -> failed`
- `parsed -> enriched`
- `parsed -> failed`
- `failed -> metadata_saved` (via retry)

Rules:
- `save` is idempotent on canonical URL.
- `retry` increments attempt counter and captures last error.
- max attempts default 3 before terminal `failed`.

## 8. Adapter Interfaces
```ts
interface SourceAdapter {
  supports(url: string): boolean;
  detectType(url: string): 'article' | 'x' | 'youtube' | 'pdf' | 'unknown';
  fetchAndParse(input: { url: string }): Promise<{
    metadata: { title?: string; author?: string; publishedAt?: string };
    chunks: Array<{ text: string; tokenCount?: number }>;
    checksum?: string;
  }>;
}
```

Design notes:
- Adapters are pure and independently testable with fixtures.
- All adapters must return normalized UTF-8 text and deterministic chunk ordering.

## 9. Reliability and Concurrency
- Use a single writer worker process by default.
- Reads can run concurrently.
- Handle `SQLITE_BUSY` with bounded exponential backoff.
- Commands must return deterministic error codes.
- Background worker restart-safe via persisted ingest job rows.

## 10. Observability
- Structured logs include `command`, `item_id`, `duration_ms`, `result`.
- Track counters:
  - `ingest_success_total`
  - `ingest_failure_total`
  - `find_latency_ms`
  - `brief_latency_ms`
- Add `linkledger doctor` later if operational complexity grows.

## 11. Performance Targets
- `save` p50 under 3 seconds for metadata path.
- `find` p95 under 250ms at 10k items.
- `brief` p95 under 1.5 seconds with max 20 candidates.

Performance method:
- Seed dataset generator for 1k, 5k, 10k items.
- Benchmark script run in CI nightly and locally pre-release.

## 12. Security and Compliance
- Local-only by default; no automatic outbound sync.
- Redact secrets from logs.
- Respect robots/terms/rate limits where applicable per adapter.
- Do not execute remote scripts/content.

## 13. Release Criteria (v1)
- All M0/M1 acceptance criteria pass.
- Article adapter stable.
- Search and ranking meet latency goals on 10k-item benchmark.
- JSON contract documented and stable for agent integration.
