import type Database from 'better-sqlite3';
import type { Annotation, AnnotationType } from '../lib/types.js';

interface CreateAnnotationInput {
  id: string;
  itemId: string;
  type: AnnotationType;
  text: string;
  actor: string;
  confidence: number | null;
  pinned: boolean;
  createdAt: string;
}

export class AnnotationRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateAnnotationInput): Annotation {
    this.db.prepare(
      `INSERT INTO annotations(id, item_id, chunk_id, type, text, actor, confidence, pinned, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      input.itemId,
      input.type,
      input.text,
      input.actor,
      input.confidence,
      input.pinned ? 1 : 0,
      input.createdAt
    );

    return this.db.prepare('SELECT * FROM annotations WHERE id = ?').get(input.id) as Annotation;
  }

  countHighlightsForItem(itemId: string, actorPrefix?: string): number {
    if (actorPrefix) {
      const row = this.db
        .prepare('SELECT COUNT(*) AS count FROM annotations WHERE item_id = ? AND type = ? AND actor LIKE ?')
        .get(itemId, 'highlight', `${actorPrefix}%`) as { count: number };
      return row.count;
    }

    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM annotations WHERE item_id = ? AND type = ?')
      .get(itemId, 'highlight') as { count: number };
    return row.count;
  }

  listByItemId(itemId: string): Annotation[] {
    return this.db
      .prepare('SELECT * FROM annotations WHERE item_id = ? ORDER BY pinned DESC, created_at DESC')
      .all(itemId) as Annotation[];
  }

  listTopByType(itemId: string, type: AnnotationType, limit: number): Annotation[] {
    return this.db
      .prepare('SELECT * FROM annotations WHERE item_id = ? AND type = ? ORDER BY pinned DESC, created_at DESC LIMIT ?')
      .all(itemId, type, limit) as Annotation[];
  }
}
