import { AppError } from '../lib/errors.js';
import { createRandomishId, itemIdFromCanonicalUrl } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { canonicalizeUrl, detectSourceType } from '../lib/url.js';
import type { Item } from '../lib/types.js';
import type { ServiceContext } from './context.js';
import { SearchIndexService } from './search-index-service.js';

export interface SaveInput {
  url: string;
  note?: string;
  tags?: string[];
}

export interface SaveResult {
  deduped: boolean;
  item: Item;
}

export class SaveService {
  constructor(private readonly context: ServiceContext) {}

  execute(input: SaveInput): SaveResult {
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeUrl(input.url);
    } catch {
      throw new AppError('INVALID_URL', `Invalid URL: ${input.url}`, false);
    }

    const existing = this.context.itemRepository.findByCanonicalUrl(canonicalUrl);
    if (existing) {
      return { deduped: true, item: existing };
    }

    const now = nowIso();
    const sourceType = detectSourceType(canonicalUrl);
    const itemId = itemIdFromCanonicalUrl(canonicalUrl);
    const indexService = new SearchIndexService(this.context);

    const tx = this.context.db.transaction(() => {
      const item = this.context.itemRepository.create({
        id: itemId,
        canonicalUrl,
        originalUrl: input.url,
        sourceType,
        ingestStatus: 'metadata_saved',
        createdAt: now
      });

      this.context.ingestJobRepository.create({
        id: createRandomishId('job', itemId),
        itemId,
        status: 'queued',
        attempts: 0,
        scheduledAt: now,
        createdAt: now
      });

      if (input.note && input.note.trim()) {
        this.context.annotationRepository.create({
          id: createRandomishId('ann', `${itemId}:note`),
          itemId,
          type: 'note',
          text: input.note.trim(),
          actor: 'human',
          confidence: null,
          pinned: false,
          createdAt: now
        });
      }

      for (const tag of input.tags ?? []) {
        this.context.tagRepository.create({
          id: createRandomishId('tag', `${itemId}:${tag}`),
          itemId,
          tag,
          actor: 'human',
          createdAt: now
        });
      }

      indexService.syncItem(itemId);

      return item;
    });

    const item = tx();
    return { deduped: false, item };
  }
}
