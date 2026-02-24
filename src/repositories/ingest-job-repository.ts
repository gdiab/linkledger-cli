import type Database from 'better-sqlite3';

interface CreateIngestJobInput {
  id: string;
  itemId: string;
  status: 'queued' | 'processing' | 'failed' | 'done';
  attempts: number;
  scheduledAt: string;
  createdAt: string;
  lastError?: string | null;
}

export interface IngestJobRow {
  id: string;
  item_id: string;
  status: 'queued' | 'processing' | 'failed' | 'done';
  attempts: number;
  last_error: string | null;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
}

export class IngestJobRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateIngestJobInput): IngestJobRow {
    this.db.prepare(
      `INSERT INTO ingest_jobs(id, item_id, status, attempts, last_error, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      input.itemId,
      input.status,
      input.attempts,
      input.lastError ?? null,
      input.scheduledAt,
      input.createdAt,
      input.createdAt
    );

    return this.db.prepare('SELECT * FROM ingest_jobs WHERE id = ?').get(input.id) as IngestJobRow;
  }

  latestByItemId(itemId: string): IngestJobRow | undefined {
    return this.db
      .prepare('SELECT * FROM ingest_jobs WHERE item_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(itemId) as IngestJobRow | undefined;
  }

  hasActiveByItemId(itemId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM ingest_jobs
         WHERE item_id = ?
         AND status IN ('queued', 'processing')`
      )
      .get(itemId) as { count: number };

    return row.count > 0;
  }

  listQueued(nowIso: string, limit: number): IngestJobRow[] {
    return this.db
      .prepare(
        `SELECT *
         FROM ingest_jobs
         WHERE status = 'queued'
         AND scheduled_at <= ?
         ORDER BY scheduled_at ASC, created_at ASC
         LIMIT ?`
      )
      .all(nowIso, limit) as IngestJobRow[];
  }

  markProcessing(jobId: string, updatedAt: string): IngestJobRow {
    this.db
      .prepare(
        `UPDATE ingest_jobs
         SET status = 'processing', attempts = attempts + 1, updated_at = ?
         WHERE id = ?`
      )
      .run(updatedAt, jobId);

    return this.db.prepare('SELECT * FROM ingest_jobs WHERE id = ?').get(jobId) as IngestJobRow;
  }

  markDone(jobId: string, updatedAt: string): IngestJobRow {
    this.db
      .prepare(
        `UPDATE ingest_jobs
         SET status = 'done', updated_at = ?
         WHERE id = ?`
      )
      .run(updatedAt, jobId);

    return this.db.prepare('SELECT * FROM ingest_jobs WHERE id = ?').get(jobId) as IngestJobRow;
  }

  markFailed(jobId: string, error: string, updatedAt: string): IngestJobRow {
    this.db
      .prepare(
        `UPDATE ingest_jobs
         SET status = 'failed', last_error = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(error, updatedAt, jobId);

    return this.db.prepare('SELECT * FROM ingest_jobs WHERE id = ?').get(jobId) as IngestJobRow;
  }

  requeue(jobId: string, error: string, scheduledAt: string, updatedAt: string): IngestJobRow {
    this.db
      .prepare(
        `UPDATE ingest_jobs
         SET status = 'queued', last_error = ?, scheduled_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(error, scheduledAt, updatedAt, jobId);

    return this.db.prepare('SELECT * FROM ingest_jobs WHERE id = ?').get(jobId) as IngestJobRow;
  }
}
