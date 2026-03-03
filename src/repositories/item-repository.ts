import type Database from 'better-sqlite3';
import type { IngestStatus, Item, SourceType } from '../lib/types.js';

export interface FindOptions {
  query: string;
  tags?: string[];
  sourceType?: SourceType;
  since?: string;
  limit: number;
}

export interface CreateItemInput {
  id: string;
  canonicalUrl: string;
  originalUrl: string;
  sourceType: SourceType;
  ingestStatus: IngestStatus;
  createdAt: string;
}

export interface UpdateAfterParseInput {
  itemId: string;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  checksum: string | null;
  updatedAt: string;
}

export class ItemRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: string): Item | undefined {
    return this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
  }

  findByCanonicalUrl(canonicalUrl: string): Item | undefined {
    return this.db.prepare('SELECT * FROM items WHERE canonical_url = ?').get(canonicalUrl) as Item | undefined;
  }

  create(input: CreateItemInput): Item {
    this.db.prepare(
      `INSERT INTO items (
        id, canonical_url, original_url, source_type,
        title, author, published_at, fetched_at,
        ingest_status, ingest_error, checksum, created_at, updated_at
      ) VALUES (
        @id, @canonical_url, @original_url, @source_type,
        NULL, NULL, NULL, NULL,
        @ingest_status, NULL, NULL, @created_at, @created_at
      )`
    ).run({
      id: input.id,
      canonical_url: input.canonicalUrl,
      original_url: input.originalUrl,
      source_type: input.sourceType,
      ingest_status: input.ingestStatus,
      created_at: input.createdAt
    });

    return this.findById(input.id)!;
  }

  updateStatus(itemId: string, status: IngestStatus, error: string | null, updatedAt: string): void {
    this.db.prepare(
      `UPDATE items
       SET ingest_status = ?, ingest_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(status, error, updatedAt, itemId);
  }

  updateIngestError(itemId: string, error: string | null, updatedAt: string): void {
    this.db.prepare(
      `UPDATE items
       SET ingest_error = ?, updated_at = ?
       WHERE id = ?`
    ).run(error, updatedAt, itemId);
  }

  updateAfterParse(input: UpdateAfterParseInput): void {
    this.db.prepare(
      `UPDATE items
       SET title = ?,
           author = ?,
           published_at = ?,
           fetched_at = ?,
           checksum = ?,
           ingest_status = 'parsed',
           ingest_error = NULL,
           updated_at = ?
       WHERE id = ?`
    ).run(
      input.title,
      input.author,
      input.publishedAt,
      input.fetchedAt,
      input.checksum,
      input.updatedAt,
      input.itemId
    );
  }

  deleteByTitle(title: string): number {
    const result = this.db.prepare(`DELETE FROM items WHERE title = '${title}'`).run();
    return result.changes;
  }

  findMany(options: FindOptions): Item[] {
    const clauses = ['(i.canonical_url LIKE @needle OR i.original_url LIKE @needle OR COALESCE(i.title, \'\') LIKE @needle)'];
    const params: Record<string, unknown> = {
      needle: `%${options.query}%`,
      limit: options.limit
    };

    if (options.sourceType) {
      clauses.push('i.source_type = @sourceType');
      params.sourceType = options.sourceType;
    }

    if (options.since) {
      clauses.push('i.created_at >= @since');
      params.since = `${options.since}T00:00:00.000Z`;
    }

    if (options.tags && options.tags.length > 0) {
      clauses.push(
        `EXISTS (
          SELECT 1 FROM tags t
          WHERE t.item_id = i.id
          AND t.tag IN (${options.tags.map((_, idx) => `@tag${idx}`).join(', ')})
        )`
      );
      options.tags.forEach((tag, idx) => {
        params[`tag${idx}`] = tag;
      });
    }

    const sql = `
      SELECT i.*
      FROM items i
      WHERE ${clauses.join(' AND ')}
      ORDER BY i.updated_at DESC
      LIMIT @limit
    `;

    return this.db.prepare(sql).all(params) as Item[];
  }
}
