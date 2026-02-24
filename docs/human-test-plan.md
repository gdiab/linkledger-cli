# Human Test Plan

This plan is for manual, real-world validation of `linkledger-cli` before deciding on next product steps.

## 1. Objectives

1. Verify daily workflow reliability (`save -> worker -> find -> brief`).
2. Measure practical usefulness for drafting and research.
3. Validate behavior at larger scale (1k/5k/10k items).
4. Identify whether human UI is required for curation speed/quality.

## 2. Prerequisites

- Node 22+ installed.
- Dependencies installed:

```bash
npm install
```

- CLI checks green:

```bash
npm run typecheck
npm test
npm run build
```

## 3. Test Environments

Use two DBs so synthetic data does not contaminate real usage.

1. Real usage DB (default):
- `.linkledger/linkledger.db`

2. Benchmark DB (recommended):

```bash
export LINKLEDGER_DB_PATH="$(pwd)/.linkledger/benchmark.db"
```

Unset when returning to normal usage:

```bash
unset LINKLEDGER_DB_PATH
```

## 4. Phase A - Smoke Test (15-30 minutes)

Use 6-10 links across source types: article, X, YouTube, PDF, Bluesky, LinkedIn.

### A1. Save and ingest

```bash
node --import tsx src/cli/index.ts save "<url>" --note "why it matters" --tags smoke,topic --json
node --import tsx src/cli/index.ts worker --limit 20 --max-attempts 3 --base-backoff-ms 2000 --json
```

Expected:
- `save`: `ok=true`, item created or deduped.
- `worker`: mostly `succeeded`; occasional `requeued` allowed.

### A2. Check status and enrichment

```bash
node --import tsx src/cli/index.ts status <item-id> --json
```

Expected:
- `item.ingest_status` should end at `enriched` for successful ingestion.
- `latest_job.status` should be `done` after successful processing.

### A3. Retrieval quality spot check

```bash
node --import tsx src/cli/index.ts find "<topic query>" --limit 10 --json
node --import tsx src/cli/index.ts brief "<task prompt>" --max-items 8 --json
```

Expected:
- `find` returns relevant results with `snippet` and `why_ranked` fields.
- `brief` returns high-signal items with `summary`, `key_claims`, highlights/lowlights/notes.

## 5. Phase B - Real Workflow Validation (1-2 weeks)

Use the tool in normal content production.

### Daily loop

1. Save sources while researching.
2. Run worker at least once before drafting.
3. Run `find` to verify retrieval coverage.
4. Run `brief` and feed output into your drafting agent.

### Metrics to track (simple sheet)

For each draft:
- Date
- Draft topic
- Used `brief`? (yes/no)
- # of reused stored sources
- `brief` usefulness score (1-5)
- Any ingest/retrieval issue? (short note)

Target signals:
- Reused source/highlight appears in many drafts.
- Useful `brief` score trends >= 4/5.
- Ingest failures are recoverable via retry/worker.

## 6. Phase C - Scale Test (Synthetic Data)

Run in benchmark DB.

### C1. Seed data

1k items:

```bash
npm run bench:seed -- --count 1000 --reset true
```

5k items:

```bash
npm run bench:seed -- --count 5000 --reset true
```

10k items:

```bash
npm run bench:seed -- --count 10000 --reset true
```

Optional mixed sources (append types):

```bash
npm run bench:seed -- --count 2500 --reset true --type article
npm run bench:seed -- --count 2500 --reset false --type x
npm run bench:seed -- --count 2500 --reset false --type youtube
npm run bench:seed -- --count 2500 --reset false --type linkedin
```

### C2. Benchmark find/brief

```bash
npm run bench:find -- --query "agent memory retrieval" --iterations 200 --limit 20
npm run bench:brief -- --query "agent memory retrieval" --iterations 100 --max-items 20
```

Expected thresholds (goal):
- `find` p95 < 250ms at 10k.
- `brief` p95 < 1.5s at 10k.

## 7. Failure/Recovery Tests

### Retry behavior

If item fails:

```bash
node --import tsx src/cli/index.ts retry <item-id> --json
node --import tsx src/cli/index.ts worker --limit 20 --json
```

Expected:
- Retry queues a new job.
- Worker either succeeds or requeues with backoff for retryable errors.

### Rebuild search index

```bash
node --import tsx src/cli/index.ts index-rebuild --json
```

Expected:
- Rebuild succeeds and `find` results remain coherent.

### Stale revalidation

Expected behavior:
- Accessing older items via `find`/`status` may queue revalidation.
- Running `worker` processes those queued refresh jobs.

## 8. Human UX Decision Gate

After 1-2 weeks, decide on UI need by answering:

1. Is manual curation (review/edit highlights) too slow in CLI?
2. Are status/retry flows too operational for daily use?
3. Do you need visual browsing of evidence sets for confidence?

If 2 or more are "yes", build a minimal human UI first for:
- Recent ingest inbox
- Highlight/lowlight review/edit
- Status + retry controls
- Brief preview and export

## 9. Report Template

At end of testing, summarize:

1. What worked reliably.
2. Top 3 quality/reliability issues.
3. Performance numbers at 1k/5k/10k.
4. Whether UI is needed now or later.
5. Next milestone scope.
