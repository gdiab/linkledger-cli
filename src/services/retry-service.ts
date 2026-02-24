import { AppError } from '../lib/errors.js';
import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { ServiceContext } from './context.js';

export class RetryService {
  constructor(private readonly context: ServiceContext) {}

  execute(itemId: string) {
    const item = this.context.itemRepository.findById(itemId);
    if (!item) {
      throw new AppError('ITEM_NOT_FOUND', `No item found for id ${itemId}`, false);
    }

    if (item.ingest_status !== 'failed') {
      throw new AppError('INVALID_RETRY_STATE', 'Retry is only allowed for items in failed state', false);
    }

    const latestJob = this.context.ingestJobRepository.latestByItemId(itemId);
    const attempts = latestJob?.attempts ?? 0;
    const now = nowIso();

    const tx = this.context.db.transaction(() => {
      this.context.itemRepository.updateStatus(itemId, 'metadata_saved', null, now);
      return this.context.ingestJobRepository.create({
        id: createRandomishId('job', `${itemId}:retry`),
        itemId,
        status: 'queued',
        attempts,
        scheduledAt: now,
        createdAt: now
      });
    });

    return tx();
  }
}
