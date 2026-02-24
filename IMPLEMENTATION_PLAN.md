# linkledger-cli Implementation Plan (v0 -> v1)

## 1. Plan Overview
This plan executes the PRD in four milestones (M0-M3) with explicit deliverables, dependencies, and acceptance criteria.

## 2. Assumptions
- Single local user with multiple local/remote agents.
- TypeScript/Node stack from `TECH_SPEC.md`.
- No UI in v1.

## 3. Work Breakdown

## M0 Foundation (Week 1)
### Tasks
1. Initialize repository structure (`src/`, `db/migrations/`, `test/fixtures/`).
2. Implement SQLite migrations and base repositories.
3. Implement URL canonicalization + deterministic ID generation.
4. Build `save` and metadata-only `find` commands.
5. Add JSON output envelope and standardized errors.

### Deliverables
- Working CLI binary `linkledger`.
- SQLite schema migrated on first run.
- `save` idempotency on canonical URL.

### Acceptance criteria
- Saving same URL twice returns same `item_id`.
- `find` returns saved item by title/url text.
- `--json` output is valid and stable.

### Dependencies
- None.

## M1 Annotation + Search Core (Week 2)
### Tasks
1. Implement annotations and tag commands.
2. Add FTS5 index and weighted BM25 ranking.
3. Build `brief`, `related`, `status`, `retry` commands.
4. Add highlight cap policy and confidence validation.
5. Implement worker loop + ingest job processing for article adapter.

### Deliverables
- End-to-end save -> parse -> find -> brief flow.
- Highlight-first retrieval with ranking reason metadata.

### Acceptance criteria
- `find` supports tags/type/date filters.
- `brief` default output is compact (no full chunks unless `--expand-chunks`).
- `status` and `retry` correctly reflect job lifecycle.
- p95 latency targets met on 1k-item dataset.

### Dependencies
- M0 complete.

## M2 Source Adapters (Week 3)
### Tasks
1. Implement X adapter.
2. Implement YouTube adapter (metadata + transcript/chunk path where available).
3. Implement PDF adapter.
4. Add adapter fallback rules and parse failure observability.
5. Improve retry/backoff and stale revalidation (>30 days).

### Deliverables
- Multi-source ingestion with consistent normalized chunks.
- Better failure isolation by source type.

### Acceptance criteria
- Each source type has fixture-backed parser tests.
- Parse failures expose clear reason and remain queryable.
- Retry path recovers transient failures.

### Dependencies
- M1 command and worker infrastructure complete.

## M3 Agent Integration + Hardening (Week 4)
### Tasks
1. Finalize JSON schema docs and examples for agents.
2. Add benchmark suite for 1k/5k/10k datasets.
3. Add migration safety tests and backup/restore docs.
4. Integrate `brief` in your content agent workflow.
5. Stabilize release (`v0.1.0`).

### Deliverables
- Agent-consumable brief payload in production-like workflow.
- Performance and reliability baseline documented.

### Acceptance criteria
- >=30% draft reuse metric can be measured.
- 10k-item search benchmark within targets.
- End-to-end workflow validated in at least 5 real drafting tasks.

### Dependencies
- M2 complete.

## 4. Cross-Cutting Workstreams
1. Documentation
- Keep command docs current with implementation.

2. Data safety
- Add `linkledger backup` in backlog if DB risk grows.

3. Developer experience
- Add make/npm scripts for migrate/test/bench.

## 5. Initial Repository Structure
```text
linkledger-cli/
  src/
    cli/
    services/
    adapters/
    db/
    ranking/
  db/
    migrations/
  test/
    unit/
    integration/
    fixtures/
  scripts/
    seed-benchmark-data.ts
    bench-find.ts
  PRD.md
  TECH_SPEC.md
  IMPLEMENTATION_PLAN.md
  TEST_PLAN.md
  DECISIONS.md
```

## 6. Risks and Mitigations
1. Parser fragility
- Mitigation: fixture tests per adapter; explicit parse failure states.

2. Search quality drift
- Mitigation: quality checks for top-k relevance; capped annotation volume.

3. SQLite lock contention
- Mitigation: WAL + single writer + retry/backoff.

## 7. Definition of Done (v1)
- M0-M3 acceptance criteria met.
- Test suite and benchmark gates green.
- CLI contract documented and stable for agent consumption.
- Decision log updated for any changes made during implementation.
