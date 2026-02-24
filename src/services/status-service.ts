import { AppError } from '../lib/errors.js';
import type { ServiceContext } from './context.js';

export class StatusService {
  constructor(private readonly context: ServiceContext) {}

  execute(itemId: string) {
    const item = this.context.itemRepository.findById(itemId);
    if (!item) {
      throw new AppError('ITEM_NOT_FOUND', `No item found for id ${itemId}`, false);
    }

    const latestJob = this.context.ingestJobRepository.latestByItemId(itemId) ?? null;
    const annotations = this.context.annotationRepository.listByItemId(itemId);
    const tags = this.context.tagRepository.listByItemId(itemId);

    return {
      item,
      latest_job: latestJob,
      annotations_count: annotations.length,
      tags_count: tags.length
    };
  }
}
