---
name: linkledger-cli-agent
description: Use this skill when an agent needs to store sources in linkledger-cli, run ingestion, and retrieve compact evidence packs with deterministic JSON output.
---

# linkledger-cli-agent

## Use this skill when
- You need to save links and notes for later reuse.
- You need to run ingestion and check item/job status.
- You need ranked retrieval (`find`, `brief`) for drafting or research tasks.
- You need source-specific ingestion for `article`, `x`, `youtube`, `pdf`, `bluesky`, or `linkedin`.
- You are researching sources for a content packet, blog draft, or any writing task.
- A human sends you a link to remember.

## Setup
- Binary: `linkledger` (wrapper at `/opt/homebrew/bin/linkledger`)
- DB path is pre-configured via the wrapper (`~/.linkledger/linkledger.db`). No env var needed.
- The wrapper `cd`s into the repo directory automatically — call `linkledger` from anywhere.

## Rules
- Prefer `--json` on all commands for deterministic machine parsing.
- For agent annotations, use `--actor agent:<your-name>` (e.g., `agent:thoth`, `agent:research-scout`).
- Always pass `--confidence 0.0-1.0` with agent annotations.
- Keep queries short and specific; broaden only if result count is low.

## When to save
- **Every source you cite** in a draft, outline, or content packet — save it.
- **Every link a human sends you** with context — save it immediately with their note.
- **Newsletter items** you pull for weekly packets — save with `--tags newsletter,<source-name>`.
- **Don't save** throwaway searches, docs you glanced at but didn't use, or duplicate URLs (dedup is automatic but avoid the noise).

## Annotation conventions

### Actor names
Use your agent identity: `agent:thoth`, `agent:research-scout`, etc. Human-provided annotations use `human`.

### Confidence guidelines
| Confidence | Use when |
|-----------|----------|
| 0.9–1.0 | Direct quote, verified fact, primary source |
| 0.7–0.89 | Strong inference from reliable source |
| 0.5–0.69 | Reasonable interpretation, secondary source |
| < 0.5 | Speculative, opinion-heavy, or unverified |

### Highlights vs lowlights
- **Highlight**: key claims, quotable insights, data points, novel framings — things you'd cite.
- **Lowlight**: caveats, weaknesses, contradictions, things to be cautious about — things that temper the source.
- **Pin** (`--pin`) a highlight only if it's the single most important takeaway from the source.

## Core workflow
1. Save source:
```bash
linkledger save "<url>" --note "<optional context>" --tags tag1,tag2 --json
```
2. Run ingestion worker:
```bash
linkledger worker --limit 20 --max-attempts 3 --base-backoff-ms 2000 --json
```
3. Inspect ingest state if needed:
```bash
linkledger status <item-id> --json
```
4. Add annotations/tags:
```bash
linkledger annotate <item-id> --highlight "<text>" --actor agent:thoth --confidence 0.82 --json
linkledger annotate <item-id> --lowlight "<caveat>" --actor agent:thoth --confidence 0.7 --json
linkledger tag <item-id> --add tag1,tag2 --actor agent:thoth --json
```
5. Retrieve:
```bash
linkledger find "<topic>" --limit 20 --json
linkledger brief "<task>" --max-items 10 --json
```

`brief` includes enrichment fields (`summary`, `key_claims`) after worker ingestion succeeds.

## Content pipeline integration
When saving sources for a content packet or blog draft:
1. Save all sources with relevant tags (e.g., `--tags weekly-w09,ai-coding`).
2. Run the worker to ingest.
3. Add highlights for the key claims you plan to reference.
4. Note the `item_id` values — these can be linked to content-board cards for full provenance.
5. When drafting, use `brief "<topic>"` to pull compact evidence packs instead of re-reading full articles.

## Recovery workflow
- If `status.item.ingest_status` is `failed`:
```bash
linkledger retry <item-id> --json
linkledger worker --limit 20 --json
```
- If search results look stale/missing:
```bash
linkledger index-rebuild --json
```
- If items are old, `find`/`status` may queue revalidation jobs automatically; run worker again to refresh.

## Output handling contract
- Success envelope shape:
  - `ok=true`
  - `data` payload
  - `meta.timestamp`, `meta.version`
- Error envelope shape:
  - `ok=false`
  - `error.code`, `error.message`, `error.retryable`

## Minimal query strategy
- First pass: `find "<specific terms>" --limit 10 --json`
- If sparse: remove one constraint or shorten phrasing.
- For production drafting: prefer `brief` after `find` validates topical coverage.
