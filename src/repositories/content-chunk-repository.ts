import type Database from 'better-sqlite3';

interface ChunkInput {
  id: string;
  itemId: string;
  chunkIndex: number;
  text: string;
  tokenCount: number;
  createdAt: string;
}

export class ContentChunkRepository {
  constructor(private readonly db: Database.Database) {}

  replaceForItem(itemId: string, chunks: ChunkInput[]): void {
    this.db.prepare('DELETE FROM content_chunks WHERE item_id = ?').run(itemId);

    const insert = this.db.prepare(
      `INSERT INTO content_chunks(id, item_id, chunk_index, text, token_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const chunk of chunks) {
      insert.run(chunk.id, chunk.itemId, chunk.chunkIndex, chunk.text, chunk.tokenCount, chunk.createdAt);
    }
  }

  listTextByItemId(itemId: string): string[] {
    return this.db
      .prepare('SELECT text FROM content_chunks WHERE item_id = ? ORDER BY chunk_index ASC')
      .all(itemId)
      .map((row) => String((row as { text: string }).text));
  }
}
