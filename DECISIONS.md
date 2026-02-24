# linkledger-cli Decision Log

## Purpose
Track architecture and product decisions so implementation stays aligned with PRD and changes are explicit.

## ADR-001: Product positioning
- Date: 2026-02-24
- Status: Accepted
- Decision: Build a CLI-first personal knowledge memory tool for human + internal agents.
- Rationale: Minimizes UI overhead and optimizes for agent integration speed.

## ADR-002: Storage model
- Date: 2026-02-24
- Status: Accepted
- Decision: Local-first SQLite as system of record.
- Rationale: Fast iteration, portability, and zero hosted infrastructure for v1.

## ADR-003: Search strategy (v1)
- Date: 2026-02-24
- Status: Accepted
- Decision: SQLite FTS5 + BM25 lexical ranking with weighted fields.
- Rationale: Predictable, fast, and simpler to operate than early semantic infrastructure.

## ADR-004: Retrieval policy
- Date: 2026-02-24
- Status: Accepted
- Decision: Highlights-first compact retrieval by default; full chunk expansion opt-in.
- Rationale: Reduces token and bandwidth cost for agent consumers.

## ADR-005: Annotation policy
- Date: 2026-02-24
- Status: Accepted
- Decision: Human + agent annotations with actor provenance and required confidence for agents.
- Rationale: Enables trust calibration and ranking control.

## ADR-006: Noise controls
- Date: 2026-02-24
- Status: Accepted
- Decision: Cap agent highlights per item (configurable 3-7) and allow human pin/unpin.
- Rationale: Prevents annotation sprawl and preserves signal quality.

## ADR-007: Concurrency model
- Date: 2026-02-24
- Status: Accepted
- Decision: SQLite WAL mode, single writer worker, bounded retry/backoff on busy locks.
- Rationale: Reliable local concurrency without external services.

## ADR-008: Ingestion lifecycle
- Date: 2026-02-24
- Status: Accepted
- Decision: Explicit states: `metadata_saved`, `parsed`, `enriched`, `failed`; include status/retry commands.
- Rationale: Operational clarity and recoverability.

## ADR-009: Freshness policy
- Date: 2026-02-24
- Status: Accepted
- Decision: Lightweight revalidation on access for items older than 30 days.
- Rationale: Prevents stale context while keeping v1 lightweight.

## ADR-010: Naming risk handling
- Date: 2026-02-24
- Status: Accepted
- Decision: Keep `Pocket for Agents` as non-shipping codename only; use `linkledger-cli` for implementation docs.
- Rationale: Avoid potential trademark risk before code and distribution.

## Open Decisions
1. Final parser libraries for X/YouTube/PDF adapters.
- Trigger: Start of M2.

2. Whether to introduce semantic embeddings in v1.1.
- Trigger: If lexical relevance misses exceed tolerance in production usage.

3. Backup/restore command timing.
- Trigger: Before first non-trivial production usage (>1k items).

## Change Process
1. New decision or reversal requires adding/updating an ADR entry.
2. Include date, status, decision, and rationale.
3. Update related docs (`PRD.md`, `TECH_SPEC.md`, `IMPLEMENTATION_PLAN.md`, `TEST_PLAN.md`) when the decision impacts them.
