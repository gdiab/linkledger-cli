import { performance } from 'node:perf_hooks';
import { createServiceContext } from '../src/services/context.js';
import { FindService } from '../src/services/find-service.js';

const arg = (name: string, fallback: string): string => {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1] as string;
  }
  return fallback;
};

const query = arg('--query', 'agent memory retrieval');
const iterations = Number.parseInt(arg('--iterations', '200'), 10);
const limit = Number.parseInt(arg('--limit', '20'), 10);

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] as number;
};

const context = createServiceContext();
const service = new FindService(context);

try {
  for (let i = 0; i < 20; i += 1) {
    service.execute({ query, limit });
  }

  const durations: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    service.execute({ query, limit });
    durations.push(performance.now() - start);
  }

  const output = {
    operation: 'find',
    query,
    iterations,
    limit,
    p50_ms: Number(percentile(durations, 50).toFixed(3)),
    p95_ms: Number(percentile(durations, 95).toFixed(3)),
    max_ms: Number(Math.max(...durations).toFixed(3))
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  context.db.close();
}
