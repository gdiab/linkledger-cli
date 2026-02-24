# linkledger-cli

CLI-first personal knowledge capture and retrieval for human+agent workflows.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Run:

```bash
node dist/cli/index.js --help
```

## Commands

- `linkledger save <url> [--note "..."] [--tags a,b] [--json]`
- `linkledger annotate <item-id> --highlight|--lowlight|--note "..." [--actor human|agent:name] [--confidence 0.0-1.0] [--pin] [--json]`
- `linkledger tag <item-id> --add a,b [--actor ...] [--json]`
- `linkledger find <query> [--tags ...] [--type article|x|youtube|pdf] [--since YYYY-MM-DD] [--limit N] [--json]`
- `linkledger brief <query> [--max-items N] [--expand-chunks] [--json]`
- `linkledger related <item-id> [--max-items N] [--json]`
- `linkledger status <item-id> [--json]`
- `linkledger retry <item-id> [--json]`
- `linkledger index-rebuild [--json]`
- `linkledger worker [--limit N] [--max-attempts N] [--json]`

## Database path

By default the SQLite database is created at:

- `.linkledger/linkledger.db` (in current working directory)

Override with:

- `LINKLEDGER_DB_PATH=/absolute/path/to/linkledger.db`

## Agent skill

An agent-usage skill is included at:

- `skills/linkledger-cli-agent/SKILL.md`
