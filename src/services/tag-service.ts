import { AppError } from '../lib/errors.js';
import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { ServiceContext } from './context.js';

export interface AddTagsInput {
  itemId: string;
  tags: string[];
  actor: string;
}

export class TagService {
  constructor(private readonly context: ServiceContext) {}

  execute(input: AddTagsInput) {
    const item = this.context.itemRepository.findById(input.itemId);
    if (!item) {
      throw new AppError('ITEM_NOT_FOUND', `No item found for id ${input.itemId}`, false);
    }

    if (input.tags.length === 0) {
      throw new AppError('INVALID_TAGS', 'At least one tag is required', false);
    }

    const now = nowIso();
    return input.tags.map((tag) =>
      this.context.tagRepository.create({
        id: createRandomishId('tag', `${input.itemId}:${tag}:${input.actor}`),
        itemId: input.itemId,
        tag,
        actor: input.actor,
        createdAt: now
      })
    );
  }
}
