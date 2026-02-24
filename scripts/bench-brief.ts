import { performance } from 'node:perf_hooks';
import { createServiceContext } from '../src/services/context.js';
import { BriefService } from '../src/services/brief-service.js';

const arg = (name: string, fallback: string): string => {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1] as string;
  }
  return fallback;
};

const query = arg('--query', 'agent memory retrieval');
const iterations = Number.parseInt(arg('--iterations', '100'), 10);
const maxItems = Number.parseInt(arg('--max-items', '20'), 10);

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] as number;
};

const context = createServiceContext();
const service = new BriefService(context);

try {
  for (let i = 0; i < 10; i += 1) {
    service.execute({ query, maxItems, expandChunks: false });
  }

  const durations: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    service.execute({ query, maxItems, expandChunks: false });
    durations.push(performance.now() - start);
  }

  const output = {
    operation: 'brief',
    query,
    iterations,
    max_items: maxItems,
    p50_ms: Number(percentile(durations, 50).toFixed(3)),
    p95_ms: Number(percentile(durations, 95).toFixed(3)),
    max_ms: Number(Math.max(...durations).toFixed(3))
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  context.db.close();
}
