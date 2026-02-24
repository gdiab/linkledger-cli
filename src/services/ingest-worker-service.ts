import { ArticleAdapter } from '../adapters/article-adapter.js';
import { BlueskyAdapter } from '../adapters/bluesky-adapter.js';
import { LinkedInAdapter } from '../adapters/linkedin-adapter.js';
import { PdfAdapter } from '../adapters/pdf-adapter.js';
import type { SourceAdapter } from '../adapters/source-adapter.js';
import { XAdapter } from '../adapters/x-adapter.js';
import { YouTubeAdapter } from '../adapters/youtube-adapter.js';
import { asAppError, AppError } from '../lib/errors.js';
import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { Item } from '../lib/types.js';
import type { ServiceContext } from './context.js';
import { EnrichmentService } from './enrichment-service.js';
import { SearchIndexService } from './search-index-service.js';

export interface WorkerRunOptions {
  limit: number;
  maxAttempts: number;
  baseBackoffMs?: number;
}

export interface WorkerRunResult {
  picked: number;
  processed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  items: Array<{
    job_id: string;
    item_id: string;
    status: 'parsed' | 'failed' | 'requeued';
    error?: string;
    next_scheduled_at?: string;
  }>;
}

const isRetryable = (error: AppError, attempts: number, maxAttempts: number): boolean =>
  error.retryable && attempts < maxAttempts;

const buildBackoffTime = (attempt: number, baseBackoffMs: number): string => {
  const exponent = Math.max(0, attempt - 1);
  const delay = baseBackoffMs * 2 ** exponent;
  return new Date(Date.now() + delay).toISOString();
};

export class IngestWorkerService {
  private readonly indexService: SearchIndexService;
  private readonly enrichmentService: EnrichmentService;
  private readonly articleAdapter = new ArticleAdapter();
  private readonly xAdapter = new XAdapter();
  private readonly youtubeAdapter = new YouTubeAdapter();
  private readonly pdfAdapter = new PdfAdapter();
  private readonly blueskyAdapter = new BlueskyAdapter();
  private readonly linkedinAdapter = new LinkedInAdapter();

  constructor(private readonly context: ServiceContext) {
    this.indexService = new SearchIndexService(context);
    this.enrichmentService = new EnrichmentService(context);
  }

  async runOnce(options: WorkerRunOptions): Promise<WorkerRunResult> {
    const queued = this.context.ingestJobRepository.listQueued(nowIso(), options.limit);
    const baseBackoffMs = options.baseBackoffMs ?? 2000;

    const result: WorkerRunResult = {
      picked: queued.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      requeued: 0,
      items: []
    };

    for (const job of queued) {
      result.processed += 1;
      const processingRow = this.context.ingestJobRepository.markProcessing(job.id, nowIso());
      const item = this.context.itemRepository.findById(processingRow.item_id);

      try {
        if (!item) {
          throw new AppError('ITEM_NOT_FOUND', `No item found for id ${processingRow.item_id}`, false);
        }

        if (processingRow.attempts > options.maxAttempts) {
          throw new AppError(
            'MAX_ATTEMPTS_EXCEEDED',
            `Ingest attempts exceeded max (${options.maxAttempts}) for item ${processingRow.item_id}`,
            false
          );
        }

        if (!['metadata_saved', 'parsed', 'enriched'].includes(item.ingest_status)) {
          throw new AppError(
            'INVALID_INGEST_STATE',
            `Cannot ingest item ${item.id} from state ${item.ingest_status}`,
            false
          );
        }

        const parsed = await this.parseWithFallback(item);
        const now = nowIso();

        const tx = this.context.db.transaction(() => {
          this.context.contentChunkRepository.replaceForItem(
            item.id,
            parsed.chunks.map((chunk, chunkIndex) => ({
              id: createRandomishId('chk', `${item.id}:${chunkIndex}:${chunk.text.slice(0, 48)}`),
              itemId: item.id,
              chunkIndex,
              text: chunk.text,
              tokenCount: chunk.tokenCount ?? chunk.text.split(/\s+/).length,
              createdAt: now
            }))
          );

          this.context.itemRepository.updateAfterParse({
            itemId: item.id,
            title: parsed.metadata.title ?? null,
            author: parsed.metadata.author ?? null,
            publishedAt: parsed.metadata.publishedAt ?? null,
            fetchedAt: parsed.fetchedAt,
            checksum: parsed.checksum ?? null,
            updatedAt: now
          });

          this.enrichmentService.enrichItem(item.id);
          this.indexService.syncItem(item.id);
          this.context.ingestJobRepository.markDone(processingRow.id, now);
        });

        tx();

        result.succeeded += 1;
        result.items.push({
          job_id: processingRow.id,
          item_id: processingRow.item_id,
          status: 'parsed'
        });
      } catch (error) {
        const appError = asAppError(error);
        const now = nowIso();

        if (isRetryable(appError, processingRow.attempts, options.maxAttempts)) {
          const nextScheduledAt = buildBackoffTime(processingRow.attempts, baseBackoffMs);

          const tx = this.context.db.transaction(() => {
            if (item) {
              this.context.itemRepository.updateIngestError(item.id, appError.message, now);
            }
            this.context.ingestJobRepository.requeue(
              processingRow.id,
              `${appError.code}: ${appError.message}`,
              nextScheduledAt,
              now
            );
          });
          tx();

          result.requeued += 1;
          result.items.push({
            job_id: processingRow.id,
            item_id: processingRow.item_id,
            status: 'requeued',
            error: `${appError.code}: ${appError.message}`,
            next_scheduled_at: nextScheduledAt
          });
          continue;
        }

        const tx = this.context.db.transaction(() => {
          this.context.itemRepository.updateStatus(processingRow.item_id, 'failed', appError.message, now);
          this.context.ingestJobRepository.markFailed(
            processingRow.id,
            `${appError.code}: ${appError.message}`,
            now
          );
        });

        tx();

        result.failed += 1;
        result.items.push({
          job_id: processingRow.id,
          item_id: processingRow.item_id,
          status: 'failed',
          error: `${appError.code}: ${appError.message}`
        });
      }
    }

    return result;
  }

  private async parseWithFallback(item: Item) {
    const adapters = this.adapterChain(item);
    const errors: AppError[] = [];

    for (const adapter of adapters) {
      try {
        return await adapter.fetchAndParse({ url: item.canonical_url });
      } catch (error) {
        errors.push(asAppError(error));
      }
    }

    if (errors.length === 0) {
      throw new AppError('ADAPTER_NOT_FOUND', `No adapter found for source type ${item.source_type}`, false);
    }

    const last = errors.at(-1)!;
    if (errors.length === 1) {
      throw last;
    }

    const reasons = errors.map((entry) => `${entry.code}: ${entry.message}`).join(' | ');
    throw new AppError(last.code, `All adapters failed (${reasons})`, last.retryable);
  }

  private adapterChain(item: Item): SourceAdapter[] {
    if (item.source_type === 'x') {
      return [this.xAdapter, this.articleAdapter];
    }

    if (item.source_type === 'youtube') {
      return [this.youtubeAdapter, this.articleAdapter];
    }

    if (item.source_type === 'bluesky') {
      return [this.blueskyAdapter, this.articleAdapter];
    }

    if (item.source_type === 'linkedin') {
      return [this.linkedinAdapter, this.articleAdapter];
    }

    if (item.source_type === 'pdf') {
      return [this.pdfAdapter];
    }

    return [this.articleAdapter];
  }
}
