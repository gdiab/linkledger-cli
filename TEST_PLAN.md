# linkledger-cli Test Plan (v0)

## 1. Goals
- Validate correctness of capture, annotation, retrieval, and retry flows.
- Prevent regressions in search relevance and latency.
- Ensure stable machine-readable outputs for agent integration.

## 2. Test Strategy
### Unit tests
- URL canonicalization and deterministic item ID generation.
- Ranking score composition and confidence penalties.
- Ingestion state transition guard logic.
- Command argument validation and error code mapping.

### Integration tests
- CLI command to DB behavior (`save/find/annotate/tag/brief/status/retry`).
- Worker processing with queued ingest jobs.
- FTS indexing and filter behavior.
- Deduplication behavior across repeated saves.

### End-to-end workflow tests
- Simulate real user flow:
  - save URL with note
  - parse to chunks
  - add highlights
  - query brief for a topic

## 3. Test Matrix
1. `save`
- New URL -> `metadata_saved` item created.
- Duplicate canonical URL -> same item returned.
- Invalid URL -> deterministic validation error.

2. `find`
- Keyword match in title.
- Keyword match in annotation text.
- Combined filters (`--tags`, `--type`, `--since`).
- Stable sort when scores tie.
- Reddit-specific source filtering (`--type reddit`) against post/comment text.

3. `annotate`
- Reject missing confidence for agent actor.
- Enforce highlight cap per item.
- Allow human pin/unpin operations.

4. `brief`
- Returns compact snippets by default.
- Includes `why_ranked` and provenance fields.
- `--expand-chunks` includes chunk text.

5. `status/retry`
- `status` reflects current ingest state.
- `retry` only allowed for `failed` (or explicitly supported transitional states).

## 4. Parser Fixture Coverage
- Article fixtures:
  - clean article page
  - noisy page with nav/ads

- X fixtures:
  - single post
  - thread style content

- YouTube fixtures:
  - metadata-only case
  - transcript-available case

- PDF fixtures:
  - text-native PDF
  - image-heavy/low-text PDF

- Reddit fixtures:
  - post with self text + top comments
  - fallback behavior when listing API fails

## 5. Performance Tests
### Dataset sizes
- 1,000 items
- 5,000 items
- 10,000 items

### Measured operations
- `save` metadata path p50
- `find` p95 latency
- `brief` p95 latency with `--max-items 20`

### Pass thresholds
- `save` p50 < 3s
- `find` p95 < 250ms at 10k items
- `brief` p95 < 1.5s at 10k items

## 6. Reliability Tests
- Kill/restart worker during ingest and verify job recovery.
- Simulate transient fetch errors and verify retry/backoff.
- Simulate SQLite busy locks with concurrent command invocations.

## 7. JSON Contract Tests
- Snapshot tests for `--json` output per command.
- Versioned schema validation for response envelopes.
- Error contract tests (`code`, `message`, `retryable`).

## 8. CI Gates
1. Unit and integration tests must pass.
2. Lint and type-check must pass.
3. JSON contract snapshots must pass.
4. Performance smoke benchmark must not regress >15% from baseline.

## 9. Manual Validation Checklist
1. Save 10 mixed sources and confirm status transitions.
2. Add human and agent highlights; verify cap and confidence rules.
3. Run topic `brief` and verify evidence quality manually.
4. Re-run after 30+ day staleness simulation and verify revalidation behavior.
5. Validate Reddit URL canonicalization (`redd.it`, `old.reddit.com`) and backfill dry run.
