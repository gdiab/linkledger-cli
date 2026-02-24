import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { ServiceContext } from './context.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export class StaleRevalidationService {
  constructor(private readonly context: ServiceContext) {}

  queueIfStale(itemId: string): boolean {
    const item = this.context.itemRepository.findById(itemId);
    if (!item?.fetched_at) {
      return false;
    }

    if (item.ingest_status === 'failed') {
      return false;
    }

    const thresholdDays = Number.parseInt(process.env.LINKLEDGER_REVALIDATE_AFTER_DAYS ?? '30', 10);
    const fetchedTime = new Date(item.fetched_at).getTime();
    if (Number.isNaN(fetchedTime)) {
      return false;
    }

    if (Date.now() - fetchedTime < thresholdDays * DAY_MS) {
      return false;
    }

    if (this.context.ingestJobRepository.hasActiveByItemId(itemId)) {
      return false;
    }

    const now = nowIso();
    this.context.ingestJobRepository.create({
      id: createRandomishId('job', `${itemId}:revalidate`),
      itemId,
      status: 'queued',
      attempts: 0,
      scheduledAt: now,
      createdAt: now,
      lastError: 'stale_revalidation'
    });

    return true;
  }
}
