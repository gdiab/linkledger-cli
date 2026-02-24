import type Database from 'better-sqlite3';
import type { SourceType } from '../lib/types.js';

export interface SearchQueryInput {
  query: string;
  tags?: string[];
  sourceType?: SourceType;
  since?: string;
  limit: number;
}

export interface SearchRow {
  id: string;
  canonical_url: string;
  original_url: string;
  source_type: SourceType;
  title: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string | null;
  ingest_status: string;
  ingest_error: string | null;
  checksum: string | null;
  created_at: string;
  updated_at: string;
  bm25_score: number;
  title_snippet: string;
  chunk_snippet: string;
  annotation_snippet: string;
  pinned_count: number;
  low_conf_count: number;
  ranking_score: number;
}

const toFtsQuery = (query: string): string => {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return '""';
  }

  return tokens.map((token) => `${token}*`).join(' AND ');
};

export class SearchIndexRepository {
  constructor(private readonly db: Database.Database) {}

  upsertItem(input: { itemId: string; title: string; chunkText: string; annotationText: string }): void {
    this.db.prepare('DELETE FROM search_fts WHERE item_id = ?').run(input.itemId);

    this.db
      .prepare(
        `INSERT INTO search_fts(item_id, title, chunk_text, annotation_text)
         VALUES (?, ?, ?, ?)`
      )
      .run(input.itemId, input.title, input.chunkText, input.annotationText);
  }

  rebuildAll(inputs: Array<{ itemId: string; title: string; chunkText: string; annotationText: string }>): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM search_fts').run();
      const insert = this.db.prepare(
        `INSERT INTO search_fts(item_id, title, chunk_text, annotation_text)
         VALUES (?, ?, ?, ?)`
      );

      for (const input of inputs) {
        insert.run(input.itemId, input.title, input.chunkText, input.annotationText);
      }
    });

    tx();
  }

  search(input: SearchQueryInput): SearchRow[] {
    const ftsQuery = toFtsQuery(input.query);

    const clauses: string[] = [];
    const params: Record<string, unknown> = {
      ftsQuery,
      limit: input.limit
    };

    if (input.sourceType) {
      clauses.push('i.source_type = @sourceType');
      params.sourceType = input.sourceType;
    }

    if (input.since) {
      clauses.push('i.created_at >= @since');
      params.since = `${input.since}T00:00:00.000Z`;
    }

    if (input.tags && input.tags.length > 0) {
      clauses.push(
        `EXISTS (
          SELECT 1 FROM tags t
          WHERE t.item_id = i.id
          AND t.tag IN (${input.tags.map((_, idx) => `@tag${idx}`).join(', ')})
        )`
      );
      input.tags.forEach((tag, idx) => {
        params[`tag${idx}`] = tag;
      });
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const sql = `
      WITH ranked AS (
        SELECT
          item_id,
          bm25(search_fts, 2.5, 1.0, 2.0) AS bm25_score,
          snippet(search_fts, 0, '[', ']', '...', 12) AS title_snippet,
          snippet(search_fts, 1, '[', ']', '...', 18) AS chunk_snippet,
          snippet(search_fts, 2, '[', ']', '...', 18) AS annotation_snippet
        FROM search_fts
        WHERE search_fts MATCH @ftsQuery
      )
      SELECT
        i.*,
        ranked.bm25_score,
        ranked.title_snippet,
        ranked.chunk_snippet,
        ranked.annotation_snippet,
        COALESCE(pin_stats.pinned_count, 0) AS pinned_count,
        COALESCE(conf_stats.low_conf_count, 0) AS low_conf_count,
        (
          ranked.bm25_score
          - (COALESCE(pin_stats.pinned_count, 0) * 0.2)
          + (COALESCE(conf_stats.low_conf_count, 0) * 0.15)
        ) AS ranking_score
      FROM ranked
      JOIN items i ON i.id = ranked.item_id
      LEFT JOIN (
        SELECT item_id, COUNT(*) AS pinned_count
        FROM annotations
        WHERE pinned = 1
        GROUP BY item_id
      ) pin_stats ON pin_stats.item_id = i.id
      LEFT JOIN (
        SELECT item_id, COUNT(*) AS low_conf_count
        FROM annotations
        WHERE actor LIKE 'agent:%' AND confidence IS NOT NULL AND confidence < 0.6
        GROUP BY item_id
      ) conf_stats ON conf_stats.item_id = i.id
      ${whereSql}
      ORDER BY ranking_score ASC, i.updated_at DESC, i.id ASC
      LIMIT @limit
    `;

    return this.db.prepare(sql).all(params) as SearchRow[];
  }
}
