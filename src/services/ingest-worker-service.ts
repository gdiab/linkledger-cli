import { ArticleAdapter } from '../adapters/article-adapter.js';
import { asAppError, AppError } from '../lib/errors.js';
import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { ServiceContext } from './context.js';
import { SearchIndexService } from './search-index-service.js';

export interface WorkerRunOptions {
  limit: number;
  maxAttempts: number;
}

export interface WorkerRunResult {
  picked: number;
  processed: number;
  succeeded: number;
  failed: number;
  items: Array<{
    job_id: string;
    item_id: string;
    status: 'parsed' | 'failed';
    error?: string;
  }>;
}

export class IngestWorkerService {
  private readonly articleAdapter = new ArticleAdapter();
  private readonly indexService: SearchIndexService;

  constructor(private readonly context: ServiceContext) {
    this.indexService = new SearchIndexService(context);
  }

  async runOnce(options: WorkerRunOptions): Promise<WorkerRunResult> {
    const queued = this.context.ingestJobRepository.listQueued(nowIso(), options.limit);
    const result: WorkerRunResult = {
      picked: queued.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      items: []
    };

    for (const job of queued) {
      result.processed += 1;
      const processingRow = this.context.ingestJobRepository.markProcessing(job.id, nowIso());

      try {
        if (processingRow.attempts > options.maxAttempts) {
          throw new AppError(
            'MAX_ATTEMPTS_EXCEEDED',
            `Ingest attempts exceeded max (${options.maxAttempts}) for item ${processingRow.item_id}`,
            false
          );
        }

        const item = this.context.itemRepository.findById(processingRow.item_id);
        if (!item) {
          throw new AppError('ITEM_NOT_FOUND', `No item found for id ${processingRow.item_id}`, false);
        }

        if (item.ingest_status !== 'metadata_saved') {
          throw new AppError(
            'INVALID_INGEST_STATE',
            `Cannot ingest item ${item.id} from state ${item.ingest_status}`,
            false
          );
        }

        if (!this.articleAdapter.supports(item.canonical_url)) {
          throw new AppError(
            'ADAPTER_NOT_IMPLEMENTED',
            `Source type ${item.source_type} adapter not implemented yet`,
            false
          );
        }

        const parsed = await this.articleAdapter.fetchAndParse({ url: item.canonical_url });
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
}
