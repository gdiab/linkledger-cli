# Backup and Restore

Default DB path:

- `.linkledger/linkledger.db`

## Safe backup (recommended)

1. Stop write activity (avoid running `worker` during backup).
2. Copy DB and WAL/SHM sidecars if present.

```bash
cp .linkledger/linkledger.db .linkledger/linkledger.db.bak
cp .linkledger/linkledger.db-wal .linkledger/linkledger.db-wal.bak 2>/dev/null || true
cp .linkledger/linkledger.db-shm .linkledger/linkledger.db-shm.bak 2>/dev/null || true
```

## Restore

```bash
cp .linkledger/linkledger.db.bak .linkledger/linkledger.db
cp .linkledger/linkledger.db-wal.bak .linkledger/linkledger.db-wal 2>/dev/null || true
cp .linkledger/linkledger.db-shm.bak .linkledger/linkledger.db-shm 2>/dev/null || true
```

## Post-restore checks

```bash
node --import tsx src/cli/index.ts index-rebuild --json
node --import tsx src/cli/index.ts find "agent memory" --limit 5 --json
```
