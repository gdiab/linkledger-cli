# JSON Contract (v0.1.0)

All commands support `--json` and return a stable envelope.

## Success envelope

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "timestamp": "2026-02-24T17:00:00.000Z",
    "version": "0.1.0"
  }
}
```

## Error envelope

```json
{
  "ok": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No item found for id itm_missing",
    "retryable": false
  }
}
```

## Command payload highlights

- `save --json`
  - `data.deduped`
  - `data.item`
- `find --json`
  - `data[]` ranked items
  - each item includes `snippet`, `why_ranked`
- `brief --json`
  - `data.items[]` includes `summary`, `key_claims`, highlights/lowlights/notes
- `status --json`
  - `data.item`, `data.latest_job`, counts
- `worker --json`
  - `data.picked`, `data.succeeded`, `data.requeued`, `data.failed`, per-item result rows
