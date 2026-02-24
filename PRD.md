# linkledger-cli - Product Requirements Document (v0)

## 1. Product Summary
**Working codename (temporary):** Pocket for Agents  
**Planned product name:** linkledger-cli  
**Type:** CLI-first personal knowledge capture and retrieval system for human+agent workflows  
**One-liner:** Save links fast, extract reusable highlights/notes, and return compact evidence packs for agents with minimal token overhead.

### Naming note
`Pocket for Agents` is a temporary ideation codename only and must not be used as a shipping name due to potential trademark infringement risk.

## 2. Context and Background
Current workflow:
- User shares links and initial thoughts with an agent.
- Agent creates outlines and drafts for blog, LinkedIn, X, and Bluesky.
- Agent opens a PR with a draft blog post.

Current gap:
- Useful references, highlights, and rationale are not consistently persisted.
- Agents repeatedly re-read full sources across tasks.
- Research context is fragmented across chats/tools.

Opportunity:
- Build a simpler, reliable "save + annotate + retrieve" system that acts as long-lived memory for agents.
- Keep v0 CLI-first to maximize speed of iteration and agent ergonomics.

## 3. Problem Statement
Knowledge artifacts (links, highlights, commentary, confidence, source quality) are not stored in a way that agents can efficiently reuse later. This causes:
- Lost context between tasks.
- Lower drafting quality due to weak evidence reuse.
- Unnecessary token spend from repeated long-form reading.
- Poor traceability for why a source was used.

## 4. Goals (V1)
1. **Fast capture:** Save a URL + optional context in seconds.
2. **Durable memory:** Persist normalized content, tags, notes, highlights/lowlights.
3. **Agent-native retrieval:** Return compact, high-signal context for drafting/research tasks.
4. **Source breadth:** Support articles, X links, YouTube, and PDFs.
5. **Search-first foundation:** Design for fast and capable retrieval as corpus size grows.

## 5. Non-Goals (V1)
- Full consumer UI with heavy interaction patterns.
- Team collaboration, permissions, billing, or SaaS multi-tenancy.
- Replacing existing content publishing pipeline.
- Perfect archival fidelity of every source format.

## 6. Users and Jobs-to-be-Done
### Primary user
- Single human operator (you) and your internal agents/sub-task agents.

### JTBD
- "When I find a useful source, I can save it immediately with minimal friction."
- "When drafting, agents can find prior high-value evidence and highlights quickly."
- "When a claim is made, I can trace source and annotation provenance."

## 7. Product Principles
1. **CLI first, API friendly** - optimize for agent calls and low bandwidth.
2. **Highlights over full text** - retrieval should prefer high-signal snippets first.
3. **Provenance always** - every annotation stores actor/time/confidence.
4. **Search is core infrastructure** - index strategy is part of v0 architecture, not a later patch.
5. **Deterministic and debuggable** - canonical IDs, dedupe rules, explicit failure states.

## 8. Functional Requirements
### 8.1 Ingestion
- Save URL with optional note and tags.
- Canonicalize URL and detect duplicates.
- Fetch and parse source content into normalized text chunks.
- Capture metadata (title, author, publication date, content type).
- Mark ingestion status with explicit stages:
  - `metadata_saved`
  - `parsed`
  - `enriched`
  - `failed` (with error reason)
- Provide operational commands for ingest visibility and recovery:
  - `linkledger status <item-id>`
  - `linkledger retry <item-id>`

### 8.2 Annotation
- Support `highlight`, `lowlight`, and `note` annotations.
- Annotation actor types: `human`, `agent:<name>`.
- Store confidence for agent-generated annotations (0.0-1.0).
- Allow tags from both human and agent with actor provenance.

### 8.3 Retrieval
- Query by keyword, tags, source type, date range, actor.
- Return ranked results with highlight-first snippets.
- Provide compact "brief" output for agent consumption:
  - canonical URL
  - source metadata
  - top highlights/lowlights
  - ranking reason metadata (`why_ranked`)
  - optional summary/key claims
- Default retrieval contract is compact/high-signal only; full chunk expansion requires an explicit flag.

### 8.4 Export/Interoperability
- JSON output mode for all commands.
- Stable IDs for items/annotations to support downstream automation.

### 8.5 Reliability
- Retry strategy for fetch/parse failures.
- Idempotent saves (same canonical URL should not create duplicates).
- Basic observability via status and ingest timestamps.

## 9. CLI Surface (Initial)
- `linkledger save <url> [--note "..."] [--tags tag1,tag2]`
- `linkledger annotate <item-id> --highlight "..." [--confidence 0.82] [--actor agent:researcher]`
- `linkledger annotate <item-id> --lowlight "..." [--confidence ...]`
- `linkledger tag <item-id> --add tag1,tag2 [--actor ...]`
- `linkledger find "query" [--tags ...] [--type article|x|youtube|pdf] [--since YYYY-MM-DD]`
- `linkledger brief "topic or task" [--max-items N] [--json] [--expand-chunks]`
- `linkledger related <item-id> [--max-items N]`
- `linkledger status <item-id>`
- `linkledger retry <item-id>`

## 10. Data Model (V1)
### Core tables
- `items`
  - `id`, `canonical_url`, `original_url`, `source_type`, `title`, `author`, `published_at`, `fetched_at`, `ingest_status`, `checksum`
- `content_chunks`
  - `id`, `item_id`, `chunk_index`, `text`, `token_count`
- `annotations`
  - `id`, `item_id`, `chunk_id (nullable)`, `type (highlight|lowlight|note)`, `text`, `actor`, `confidence`, `created_at`
- `tags`
  - `id`, `item_id`, `tag`, `actor`, `created_at`
- `artifacts`
  - `id`, `item_id`, `summary`, `key_claims_json`, `created_by`, `created_at`

### Required indexes (v1)
- `items(canonical_url)` unique
- `items(source_type, fetched_at)`
- `tags(tag, item_id)`
- `annotations(item_id, type, created_at)`
- `content_chunks(item_id, chunk_index)`

## 11. Search and Indexing Architecture (Priority)
As corpus grows, retrieval quality and latency become product-critical. v0 will include explicit search foundations:

### 11.1 Phase 1 (required in v1)
- SQLite + FTS5 virtual table for full-text search over:
  - item titles
  - normalized chunk text
  - annotation text
- BM25 ranking with weighted fields (title/highlight text weighted above body text).
- Tag filtering and source/date filters applied at query time.
- Snippet generation returns compact context windows.
- Retrieval ranking down-weights low-confidence agent annotations.

### 11.2 Phase 2 (optional after baseline)
- Hybrid retrieval:
  - lexical (FTS/BM25) + semantic embedding similarity.
- Re-ranking for "brief" output quality.
- Cached topic-level memory packs for recurring tasks.

### 11.3 Performance targets
- `save` p50 < 3s for metadata path; full parse async.
- `find` p95 < 250ms at 10k items on local machine.
- `brief` p95 < 1.5s with max 20 candidate items.

## 12. Architecture (V1)
- **Local-first:** SQLite database in local workspace/app data.
- **CLI package:** main interaction surface for human and agents.
- **Ingestion adapters:** pluggable parsers per source type (article/x/youtube/pdf).
- **Async ingestion pipeline:** save event creates record immediately, parsing/refinement can complete in background.
- **Stateless command execution:** commands return deterministic output, with optional JSON for machine clients.
- **Concurrency defaults:** SQLite WAL mode + bounded retry/backoff for write-lock contention.

## 13. Provenance and Quality Controls
- Every annotation/tag/artifact stores actor and timestamp.
- Agent annotations require confidence value (defaulted if omitted).
- Agent annotation generation is controlled:
  - max 3-7 highlights per item (configurable)
  - human pin/unpin override for highlights
- Duplicate/near-duplicate detection via canonical URL + checksum.
- Source parsing failures are explicit and queryable.
- Staleness policy: items older than 30 days trigger lightweight revalidation on access.

## 14. Success Metrics (POC Gate)
POC considered successful if, over 2-3 weeks:
1. >=30% of new drafts reuse at least one stored source or highlight.
2. `save` median time <=10 seconds end-to-end.
3. At least 70% of "brief" responses judged useful by human review.
4. Measurable reduction in repeated full-source reads by agents.

## 15. Risks and Open Questions
1. **Parsing reliability:** X/YouTube/PDF extraction quality can vary.
2. **Noise risk:** Over-generated agent highlights may reduce signal.
3. **Ranking quality ceiling:** lexical-only may underperform for fuzzy topic recall before hybrid retrieval.
4. **Governance:** how to deprecate stale/low-quality annotations over time.
5. **Naming/legal:** selecting a non-infringing final product name before implementation.

## 16. Milestones
### M0 - Foundation
- SQLite schema, canonical save, dedupe, basic fetch metadata.
- CLI: `save`, `find` (metadata only), `--json` support.

### M1 - Annotation + Search Core
- Annotation commands.
- FTS5 index and weighted lexical ranking.
- Highlights-first snippets in `find`.

### M2 - Source Adapters
- Add adapters for X, YouTube, PDFs.
- Improved parse robustness + retries.

### M3 - Agent Briefing
- `brief` command outputs compact evidence packs.
- Integration into existing content drafting agent workflow.

## 17. Default Product Decisions (Pressure-Tested)
1. **Single-user first:** yes (you + your agents).
2. **Storage model:** local-first SQLite.
3. **Ingestion storage:** canonical metadata + normalized text chunks; optional raw fetch artifact for debugging only.
4. **Annotation model:** human + agent annotations with provenance/confidence, plus capped agent highlights per item.
5. **Retrieval model:** BM25 lexical/tag first with weighted fields; hybrid semantic later.
6. **Freshness policy:** lightweight revalidation on access after 30 days.
7. **Integration interface:** CLI-first with stable JSON contract (no local HTTP service in v1).
8. **Differentiator:** agent-native CLI with low token and bandwidth overhead.

## 18. Future UI Direction (Post-v1)
UI can be introduced after retrieval quality is stable, focused on:
- Reviewing/editing highlights.
- Curating high-signal evidence sets.
- Human override of agent tags/confidence.
- Lightweight browse/search experience for manual curation.

---
**Version:** v0 draft  
**Status:** Ready for iteration
