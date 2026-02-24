import { AppError } from '../lib/errors.js';
import type { ServiceContext } from './context.js';

const normalizeMultiline = (parts: string[]): string =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');

export class SearchIndexService {
  constructor(private readonly context: ServiceContext) {}

  syncItem(itemId: string): void {
    const item = this.context.itemRepository.findById(itemId);
    if (!item) {
      throw new AppError('ITEM_NOT_FOUND', `No item found for id ${itemId}`, false);
    }

    const chunks = this.context.contentChunkRepository.listTextByItemId(itemId);
    const annotations = this.context.annotationRepository.listByItemId(itemId);

    const annotationText = normalizeMultiline(
      annotations.map((annotation) => `${annotation.type} ${annotation.actor}: ${annotation.text}`)
    );

    const chunkText = normalizeMultiline([item.canonical_url, item.original_url, ...chunks]);

    this.context.searchIndexRepository.upsertItem({
      itemId,
      title: item.title ?? '',
      chunkText,
      annotationText
    });
  }

  syncAll(): { items: number } {
    const rows = this.context.db
      .prepare('SELECT id FROM items ORDER BY created_at ASC')
      .all() as Array<{ id: string }>;

    const payload = rows.map((row) => {
      const item = this.context.itemRepository.findById(row.id);
      const chunks = this.context.contentChunkRepository.listTextByItemId(row.id);
      const annotations = this.context.annotationRepository.listByItemId(row.id);

      return {
        itemId: row.id,
        title: item?.title ?? '',
        chunkText: normalizeMultiline([item?.canonical_url ?? '', item?.original_url ?? '', ...chunks]),
        annotationText: normalizeMultiline(
          annotations.map((annotation) => `${annotation.type} ${annotation.actor}: ${annotation.text}`)
        )
      };
    });

    this.context.searchIndexRepository.rebuildAll(payload);
    return { items: payload.length };
  }
}
