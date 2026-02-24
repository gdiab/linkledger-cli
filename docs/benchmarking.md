# Benchmarking

Seed benchmark data (default 1000 items):

```bash
npm run bench:seed -- --count 1000 --reset true
```

Run `find` benchmark:

```bash
npm run bench:find -- --query "agent memory retrieval" --iterations 200 --limit 20
```

Run `brief` benchmark:

```bash
npm run bench:brief -- --query "agent memory retrieval" --iterations 100 --max-items 20
```

Run both after seeding:

```bash
npm run bench
```

Output is JSON with p50/p95/max latency in milliseconds.
