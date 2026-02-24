import { AppError } from '../lib/errors.js';
import type { ServiceContext } from './context.js';

export class RelatedService {
  constructor(private readonly context: ServiceContext) {}

  execute(itemId: string, maxItems: number) {
    const item = this.context.itemRepository.findById(itemId);
    if (!item) {
      throw new AppError('ITEM_NOT_FOUND', `No item found for id ${itemId}`, false);
    }

    const sql = `
      SELECT i.id, i.canonical_url, i.source_type, i.title, COUNT(*) AS overlap
      FROM items i
      JOIN tags t ON t.item_id = i.id
      WHERE i.id != ?
      AND t.tag IN (SELECT tag FROM tags WHERE item_id = ?)
      GROUP BY i.id, i.canonical_url, i.source_type, i.title
      ORDER BY overlap DESC, i.updated_at DESC
      LIMIT ?
    `;

    return this.context.db.prepare(sql).all(itemId, itemId, maxItems);
  }
}
