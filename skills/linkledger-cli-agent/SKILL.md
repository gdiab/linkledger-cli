---
name: linkledger-cli-agent
description: Use this skill when an agent needs to store sources in linkledger-cli, run ingestion, and retrieve compact evidence packs with deterministic JSON output.
---

# linkledger-cli-agent

## Use this skill when
- You need to save links and notes for later reuse.
- You need to run ingestion and check item/job status.
- You need ranked retrieval (`find`, `brief`) for drafting or research tasks.

## Rules
- Prefer `--json` on all commands for deterministic machine parsing.
- For agent annotations (`--actor agent:<name>`), always pass `--confidence 0.0-1.0`.
- Keep queries short and specific; broaden only if result count is low.

## Core workflow
1. Save source:
```bash
linkledger save "<url>" --note "<optional context>" --tags tag1,tag2 --json
```
2. Run ingestion worker:
```bash
linkledger worker --limit 20 --max-attempts 3 --json
```
3. Inspect ingest state if needed:
```bash
linkledger status <item-id> --json
```
4. Add annotations/tags:
```bash
linkledger annotate <item-id> --highlight "<text>" --actor agent:researcher --confidence 0.82 --json
linkledger tag <item-id> --add tag1,tag2 --actor agent:researcher --json
```
5. Retrieve:
```bash
linkledger find "<topic>" --limit 20 --json
linkledger brief "<task>" --max-items 10 --json
```

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
