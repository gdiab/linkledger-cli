import assert from 'node:assert/strict';
import test from 'node:test';
import { withTempDb } from '../helpers/temp-db.js';
import { createServiceContext } from '../../src/services/context.js';
import { IngestWorkerService } from '../../src/services/ingest-worker-service.js';
import { SaveService } from '../../src/services/save-service.js';

test('worker parses and enriches saved article', async () => {
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
      assert.equal(run.requeued, 0);
      assert.equal(run.failed, 0);

      const item = context.itemRepository.findById(saved.item.id);
      assert.ok(item);
      assert.equal(item.ingest_status, 'enriched');
      assert.equal(item.title, 'T1');

      const chunks = context.contentChunkRepository.listTextByItemId(saved.item.id);
      assert.equal(chunks.length > 0, true);

      const artifact = context.artifactRepository.findByItemId(saved.item.id);
      assert.ok(artifact);
      assert.equal((artifact.summary ?? '').length > 0, true);

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

test('worker requeues retryable failures with backoff and succeeds on next run', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const save = new SaveService(context);
    const worker = new IngestWorkerService(context);
    const originalFetch = globalThis.fetch;

    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('temporary upstream issue', {
          status: 503,
          headers: { 'content-type': 'text/html' }
        });
      }

      return new Response(
        '<html><head><title>Recovered</title></head><body><p>Retry eventually succeeds.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    };

    try {
      const saved = save.execute({ url: 'https://example.com/retryable' }).item;

      const first = await worker.runOnce({ limit: 10, maxAttempts: 3, baseBackoffMs: 0 });
      assert.equal(first.succeeded, 0);
      assert.equal(first.requeued, 1);
      assert.equal(first.failed, 0);

      const afterFirst = context.itemRepository.findById(saved.id);
      assert.ok(afterFirst);
      assert.equal(afterFirst.ingest_status, 'metadata_saved');
      assert.equal(afterFirst.ingest_error?.includes('Fetch failed'), true);

      const second = await worker.runOnce({ limit: 10, maxAttempts: 3, baseBackoffMs: 0 });
      assert.equal(second.succeeded, 1);
      assert.equal(second.requeued, 0);
      assert.equal(second.failed, 0);

      const afterSecond = context.itemRepository.findById(saved.id);
      assert.ok(afterSecond);
      assert.equal(afterSecond.ingest_status, 'enriched');
      assert.equal(afterSecond.title, 'Recovered');

      const latestJob = context.ingestJobRepository.latestByItemId(saved.id);
      assert.ok(latestJob);
      assert.equal(latestJob.status, 'done');
      assert.equal(latestJob.attempts, 2);
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});
