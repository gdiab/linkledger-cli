#!/usr/bin/env node
import { Command } from 'commander';
import { AnnotationService } from '../services/annotation-service.js';
import { BriefService } from '../services/brief-service.js';
import { createServiceContext } from '../services/context.js';
import { FindService } from '../services/find-service.js';
import { IngestWorkerService } from '../services/ingest-worker-service.js';
import { RelatedService } from '../services/related-service.js';
import { RetryService } from '../services/retry-service.js';
import { SaveService } from '../services/save-service.js';
import { SearchIndexService } from '../services/search-index-service.js';
import { StatusService } from '../services/status-service.js';
import { TagService } from '../services/tag-service.js';
import { asAppError, AppError } from '../lib/errors.js';
import { failure, printJson, success } from '../lib/output.js';
import { parseCsv } from '../lib/parsing.js';
import type { AnnotationType, SourceType } from '../lib/types.js';
import { APP_VERSION } from '../lib/version.js';

const context = createServiceContext();
const program = new Command();

program
  .name('linkledger')
  .description('CLI-first personal knowledge capture and retrieval for agents')
  .version(APP_VERSION);

interface JsonOption {
  json?: boolean;
}

const runCommand = (json: boolean, fn: () => unknown, textFormatter: (data: unknown) => string): void => {
  try {
    const data = fn();
    if (json) {
      printJson(success(data));
      return;
    }

    process.stdout.write(`${textFormatter(data)}\n`);
  } catch (error) {
    const appError = asAppError(error);
    if (json) {
      printJson(failure(appError));
      process.exitCode = 1;
      return;
    }

    process.stderr.write(`[${appError.code}] ${appError.message}\n`);
    process.exitCode = 1;
  }
};

const runCommandAsync = async (
  json: boolean,
  fn: () => Promise<unknown>,
  textFormatter: (data: unknown) => string
): Promise<void> => {
  try {
    const data = await fn();
    if (json) {
      printJson(success(data));
      return;
    }

    process.stdout.write(`${textFormatter(data)}\n`);
  } catch (error) {
    const appError = asAppError(error);
    if (json) {
      printJson(failure(appError));
      process.exitCode = 1;
      return;
    }

    process.stderr.write(`[${appError.code}] ${appError.message}\n`);
    process.exitCode = 1;
  }
};

program
  .command('save')
  .description('Save a URL with optional note and tags')
  .argument('<url>', 'URL to save')
  .option('--note <text>', 'Optional note')
  .option('--tags <csv>', 'Comma-separated tags')
  .option('--json', 'Output machine-readable JSON envelope')
  .action((url: string, options: JsonOption & { note?: string; tags?: string }) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new SaveService(context);
        return service.execute({
          url,
          note: options.note,
          tags: parseCsv(options.tags)
        });
      },
      (data) => {
        const result = data as { deduped: boolean; item: { id: string; canonical_url: string; source_type: string } };
        const action = result.deduped ? 'Found existing item' : 'Saved new item';
        return `${action} ${result.item.id} (${result.item.source_type}) -> ${result.item.canonical_url}`;
      }
    );
  });

program
  .command('annotate')
  .description('Add a highlight, lowlight, or note annotation')
  .argument('<item-id>', 'Target item id')
  .option('--highlight <text>', 'Highlight text')
  .option('--lowlight <text>', 'Lowlight text')
  .option('--note <text>', 'Note text')
  .option('--actor <actor>', 'Actor identifier (e.g. human, agent:researcher)', 'human')
  .option('--confidence <n>', 'Agent confidence value between 0 and 1', parseFloat)
  .option('--pin', 'Pin annotation (increases rank)')
  .option('--json', 'Output machine-readable JSON envelope')
  .action(
    (
      itemId: string,
      options: JsonOption & {
        highlight?: string;
        lowlight?: string;
        note?: string;
        actor: string;
        confidence?: number;
        pin?: boolean;
      }
    ) => {
      runCommand(
        options.json ?? false,
        () => {
          const entries = [
            ['highlight', options.highlight],
            ['lowlight', options.lowlight],
            ['note', options.note]
          ].filter(([, value]) => Boolean(value));

          if (entries.length !== 1) {
            throw new AppError(
              'INVALID_ANNOTATE_INPUT',
              'Provide exactly one of --highlight, --lowlight, or --note',
              false
            );
          }

          const [type, text] = entries[0] as [AnnotationType, string];
          const service = new AnnotationService(context);
          return service.execute({
            itemId,
            type,
            text,
            actor: options.actor,
            confidence: Number.isFinite(options.confidence) ? options.confidence : undefined,
            pin: options.pin
          });
        },
        (data) => {
          const result = data as { id: string; type: string; item_id: string };
          return `Added ${result.type} annotation ${result.id} to ${result.item_id}`;
        }
      );
    }
  );

program
  .command('tag')
  .description('Add tags to an item')
  .argument('<item-id>', 'Target item id')
  .requiredOption('--add <csv>', 'Comma-separated tags to add')
  .option('--actor <actor>', 'Actor identifier', 'human')
  .option('--json', 'Output machine-readable JSON envelope')
  .action((itemId: string, options: JsonOption & { add: string; actor: string }) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new TagService(context);
        return service.execute({
          itemId,
          tags: parseCsv(options.add),
          actor: options.actor
        });
      },
      (data) => {
        const tags = data as Array<{ tag: string }>;
        return `Added ${tags.length} tag(s): ${tags.map((tag) => tag.tag).join(', ')}`;
      }
    );
  });

program
  .command('find')
  .description('Find items by query with optional filters')
  .argument('<query>', 'Search query')
  .option('--tags <csv>', 'Filter by tags')
  .option('--type <source-type>', 'Filter by source type (article|x|youtube|pdf|bluesky|linkedin|reddit)')
  .option('--since <yyyy-mm-dd>', 'Filter by creation date (inclusive)')
  .option('--limit <n>', 'Result limit', (value) => Number.parseInt(value, 10), 20)
  .option('--json', 'Output machine-readable JSON envelope')
  .action(
    (
      query: string,
      options: JsonOption & { tags?: string; type?: SourceType; since?: string; limit: number }
    ) => {
      runCommand(
        options.json ?? false,
        () => {
          const service = new FindService(context);
          return service.execute({
            query,
            tags: parseCsv(options.tags),
            sourceType: options.type,
            since: options.since,
            limit: options.limit
          });
        },
        (data) => {
          const items = data as Array<{
            id: string;
            canonical_url: string;
            tags: string[];
            top_highlights: string[];
            snippet: string | null;
            why_ranked: { ranking_score: number };
          }>;
          if (items.length === 0) {
            return 'No items found';
          }

          return items
            .map(
              (item, index) =>
                `${index + 1}. ${item.id} ${item.canonical_url}\n   tags=${item.tags.join(', ') || '-'} highlights=${item.top_highlights.length} score=${item.why_ranked.ranking_score.toFixed(3)}\n   snippet=${item.snippet ?? '-'}`
            )
            .join('\n');
        }
      );
    }
  );

program
  .command('brief')
  .description('Return compact evidence packs for a topic/task')
  .argument('<query>', 'Topic or task query')
  .option('--max-items <n>', 'Max candidate items', (value) => Number.parseInt(value, 10), 10)
  .option('--expand-chunks', 'Include full chunk expansion')
  .option('--json', 'Output machine-readable JSON envelope')
  .action((query: string, options: JsonOption & { maxItems: number; expandChunks?: boolean }) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new BriefService(context);
        return service.execute({
          query,
          maxItems: options.maxItems,
          expandChunks: options.expandChunks ?? false
        });
      },
      (data) => {
        const result = data as { items: Array<{ item_id: string; top_highlights: unknown[] }> };
        return `Brief produced ${result.items.length} item(s) with compact evidence.`;
      }
    );
  });

program
  .command('related')
  .description('Find related items by tag overlap')
  .argument('<item-id>', 'Source item id')
  .option('--max-items <n>', 'Max related items', (value) => Number.parseInt(value, 10), 10)
  .option('--json', 'Output machine-readable JSON envelope')
  .action((itemId: string, options: JsonOption & { maxItems: number }) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new RelatedService(context);
        return service.execute(itemId, options.maxItems);
      },
      (data) => {
        const items = data as Array<{ id: string; overlap: number }>;
        if (items.length === 0) {
          return 'No related items found';
        }

        return items.map((item) => `${item.id} overlap=${item.overlap}`).join('\n');
      }
    );
  });

program
  .command('status')
  .description('Get ingest and annotation status for an item')
  .argument('<item-id>', 'Target item id')
  .option('--json', 'Output machine-readable JSON envelope')
  .action((itemId: string, options: JsonOption) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new StatusService(context);
        return service.execute(itemId);
      },
      (data) => {
        const result = data as {
          item: { id: string; ingest_status: string };
          latest_job: { status: string; attempts: number } | null;
          annotations_count: number;
          tags_count: number;
        };
        const jobStatus = result.latest_job
          ? `${result.latest_job.status} attempts=${result.latest_job.attempts}`
          : 'none';
        return `item=${result.item.id} ingest=${result.item.ingest_status} job=${jobStatus} annotations=${result.annotations_count} tags=${result.tags_count}`;
      }
    );
  });

program
  .command('retry')
  .description('Retry ingestion for a failed item')
  .argument('<item-id>', 'Target item id')
  .option('--json', 'Output machine-readable JSON envelope')
  .action((itemId: string, options: JsonOption) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new RetryService(context);
        return service.execute(itemId);
      },
      (data) => {
        const result = data as { id: string; status: string; attempts: number };
        return `Queued retry job ${result.id} status=${result.status} attempts=${result.attempts}`;
      }
    );
  });

program
  .command('index-rebuild')
  .description('Rebuild the FTS search index from current items/chunks/annotations')
  .option('--json', 'Output machine-readable JSON envelope')
  .action((options: JsonOption) => {
    runCommand(
      options.json ?? false,
      () => {
        const service = new SearchIndexService(context);
        return service.syncAll();
      },
      (data) => {
        const result = data as { items: number };
        return `Rebuilt FTS index for ${result.items} item(s)`;
      }
    );
  });

program
  .command('worker')
  .description('Process queued ingest jobs once')
  .option('--limit <n>', 'Maximum queued jobs to process', (value) => Number.parseInt(value, 10), 10)
  .option('--max-attempts <n>', 'Maximum ingest attempts per job', (value) => Number.parseInt(value, 10), 3)
  .option('--base-backoff-ms <n>', 'Base backoff in ms for retryable ingestion failures', (value) => Number.parseInt(value, 10), 2000)
  .option('--json', 'Output machine-readable JSON envelope')
  .action(async (options: JsonOption & { limit: number; maxAttempts: number; baseBackoffMs: number }) => {
    await runCommandAsync(
      options.json ?? false,
      async () => {
        const service = new IngestWorkerService(context);
        return service.runOnce({
          limit: options.limit,
          maxAttempts: options.maxAttempts,
          baseBackoffMs: options.baseBackoffMs
        });
      },
      (data) => {
        const result = data as { picked: number; succeeded: number; failed: number; requeued: number };
        return `worker picked=${result.picked} succeeded=${result.succeeded} requeued=${result.requeued} failed=${result.failed}`;
      }
    );
  });

program.parse();
