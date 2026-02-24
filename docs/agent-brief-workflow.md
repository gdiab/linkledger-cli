# Agent Brief Workflow

Use this sequence in drafting flows:

1. Save new references.
2. Run worker to ingest and enrich.
3. Query `find` to validate topical coverage.
4. Generate compact pack with `brief`.
5. Draft from `brief` evidence and cite canonical URLs.

Example:

```bash
linkledger save "https://example.com/source" --note "why it matters" --tags draft-topic --json
linkledger worker --limit 20 --max-attempts 3 --base-backoff-ms 2000 --json
linkledger find "draft topic" --tags draft-topic --limit 10 --json
linkledger brief "Write an article about draft topic" --max-items 8 --json
```
