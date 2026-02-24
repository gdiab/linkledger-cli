import assert from 'node:assert/strict';
import test from 'node:test';
import { withTempDb } from '../helpers/temp-db.js';
import { createServiceContext } from '../../src/services/context.js';
import { IngestWorkerService } from '../../src/services/ingest-worker-service.js';
import { SaveService } from '../../src/services/save-service.js';

test('worker parses saved article and marks ingest done', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(
        '<html><head><title>T1</title></head><body><p>Paragraph one useful text.</p><p>Paragraph two useful text.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      );

    try {
      const save = new SaveService(context);
      const saved = save.execute({
        url: 'https://example.com/post?utm_source=test',
        note: 'capture this',
        tags: ['research']
      });

      const worker = new IngestWorkerService(context);
      const run = await worker.runOnce({ limit: 10, maxAttempts: 3 });

      assert.equal(run.succeeded, 1);
      assert.equal(run.failed, 0);

      const item = context.itemRepository.findById(saved.item.id);
      assert.ok(item);
      assert.equal(item.ingest_status, 'parsed');
      assert.equal(item.title, 'T1');

      const chunks = context.contentChunkRepository.listTextByItemId(saved.item.id);
      assert.equal(chunks.length > 0, true);

      const latestJob = context.ingestJobRepository.latestByItemId(saved.item.id);
      assert.ok(latestJob);
      assert.equal(latestJob.status, 'done');
      assert.equal(latestJob.attempts, 1);
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});

test('worker marks unsupported source types as failed', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();

    try {
      const save = new SaveService(context);
      const saved = save.execute({
        url: 'https://www.youtube.com/watch?v=abc123'
      });

      const worker = new IngestWorkerService(context);
      const run = await worker.runOnce({ limit: 10, maxAttempts: 3 });

      assert.equal(run.succeeded, 0);
      assert.equal(run.failed, 1);

      const item = context.itemRepository.findById(saved.item.id);
      assert.ok(item);
      assert.equal(item.ingest_status, 'failed');

      const latestJob = context.ingestJobRepository.latestByItemId(saved.item.id);
      assert.ok(latestJob);
      assert.equal(latestJob.status, 'failed');
    } finally {
      context.db.close();
    }
  });
});
