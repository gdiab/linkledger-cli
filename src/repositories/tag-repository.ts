import type Database from 'better-sqlite3';
import type { Tag } from '../lib/types.js';

interface CreateTagInput {
  id: string;
  itemId: string;
  tag: string;
  actor: string;
  createdAt: string;
}

export class TagRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateTagInput): Tag {
    this.db.prepare(
      `INSERT OR IGNORE INTO tags(id, item_id, tag, actor, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(input.id, input.itemId, input.tag, input.actor, input.createdAt);

    return this.db
      .prepare('SELECT * FROM tags WHERE item_id = ? AND tag = ? AND actor = ?')
      .get(input.itemId, input.tag, input.actor) as Tag;
  }

  listByItemId(itemId: string): Tag[] {
    return this.db.prepare('SELECT * FROM tags WHERE item_id = ? ORDER BY created_at DESC').all(itemId) as Tag[];
  }
}
