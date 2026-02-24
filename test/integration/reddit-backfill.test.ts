import assert from 'node:assert/strict';
import test from 'node:test';
import { createServiceContext } from '../../src/services/context.js';
import { RedditBackfillService } from '../../src/services/reddit-backfill-service.js';
import { withTempDb } from '../helpers/temp-db.js';

test('reddit backfill reclassifies article items and skips canonical conflicts', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();

    try {
      const now = new Date().toISOString();
      context.db
        .prepare(
          `INSERT INTO items (
            id, canonical_url, original_url, source_type,
            title, author, published_at, fetched_at,
            ingest_status, ingest_error, checksum, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)`
        )
        .run(
          'itm_reddit_old',
          'https://old.reddit.com/r/programming/comments/AbC123/linkledger_release/?context=3',
          'https://old.reddit.com/r/programming/comments/AbC123/linkledger_release/?context=3',
          'article',
          'metadata_saved',
          '2026-01-01T00:00:00.000Z',
          now
        );

      context.db
        .prepare(
          `INSERT INTO items (
            id, canonical_url, original_url, source_type,
            title, author, published_at, fetched_at,
            ingest_status, ingest_error, checksum, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)`
        )
        .run(
          'itm_reddit_short',
          'https://redd.it/abc123',
          'https://redd.it/abc123',
          'article',
          'metadata_saved',
          '2026-01-02T00:00:00.000Z',
          now
        );

      const service = new RedditBackfillService(context);
      const result = service.execute();

      assert.equal(result.scanned, 2);
      assert.equal(result.updated, 1);
      assert.equal(result.updated_canonical, 1);
      assert.equal(result.conflicts, 1);
      assert.deepEqual(result.conflict_item_ids, ['itm_reddit_short']);

      const updated = context.itemRepository.findById('itm_reddit_old');
      assert.ok(updated);
      assert.equal(updated.source_type, 'reddit');
      assert.equal(updated.canonical_url, 'https://www.reddit.com/comments/abc123');

      const conflicted = context.itemRepository.findById('itm_reddit_short');
      assert.ok(conflicted);
      assert.equal(conflicted.source_type, 'article');
      assert.equal(conflicted.canonical_url, 'https://redd.it/abc123');
    } finally {
      context.db.close();
    }
  });
});

test('reddit backfill dry-run reports changes without mutating rows', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();

    try {
      const now = new Date().toISOString();
      context.db
        .prepare(
          `INSERT INTO items (
            id, canonical_url, original_url, source_type,
            title, author, published_at, fetched_at,
            ingest_status, ingest_error, checksum, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)`
        )
        .run(
          'itm_dry_run',
          'https://www.reddit.com/r/programming/comments/abc123/linkledger_release',
          'https://www.reddit.com/r/programming/comments/abc123/linkledger_release',
          'article',
          'metadata_saved',
          '2026-01-01T00:00:00.000Z',
          now
        );

      const service = new RedditBackfillService(context);
      const result = service.execute({ dryRun: true });

      assert.equal(result.dry_run, true);
      assert.equal(result.updated, 1);
      assert.equal(result.updated_canonical, 1);

      const row = context.itemRepository.findById('itm_dry_run');
      assert.ok(row);
      assert.equal(row.source_type, 'article');
      assert.equal(row.canonical_url, 'https://www.reddit.com/r/programming/comments/abc123/linkledger_release');
    } finally {
      context.db.close();
    }
  });
});
