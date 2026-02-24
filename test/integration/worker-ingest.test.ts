import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { withTempDb } from '../helpers/temp-db.js';
import { createServiceContext } from '../../src/services/context.js';
import { IngestWorkerService } from '../../src/services/ingest-worker-service.js';
import { SaveService } from '../../src/services/save-service.js';

const fixture = (folder: string, name: string): string =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', folder, name), 'utf8');

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

test('worker uses first-class Bluesky, LinkedIn, and Reddit adapters', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const save = new SaveService(context);
    const worker = new IngestWorkerService(context);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('embed.bsky.app/oembed')) {
        return new Response(fixture('bluesky', 'oembed.json'), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (url.includes('linkedin.com')) {
        return new Response(fixture('linkedin', 'page.html'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        });
      }

      if (url.includes('reddit.com/comments/abc123.json')) {
        return new Response(fixture('reddit', 'listing.json'), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response('<html><body>fallback article</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      });
    };

    try {
      const blueskyItem = save.execute({
        url: 'https://bsky.app/profile/georgediab.com/post/3kxyz123'
      }).item;
      const linkedinItem = save.execute({
        url: 'https://www.linkedin.com/posts/gdiab_memory-layer-cli'
      }).item;
      const redditItem = save.execute({
        url: 'https://old.reddit.com/r/programming/comments/abc123/linkledger_release/?context=3&utm_source=share'
      }).item;

      const run = await worker.runOnce({ limit: 20, maxAttempts: 3, baseBackoffMs: 0 });
      assert.equal(run.succeeded, 3);
      assert.equal(run.failed, 0);
      assert.equal(run.requeued, 0);

      const bluesky = context.itemRepository.findById(blueskyItem.id);
      assert.ok(bluesky);
      assert.equal(bluesky.source_type, 'bluesky');
      assert.equal(bluesky.ingest_status, 'enriched');

      const linkedin = context.itemRepository.findById(linkedinItem.id);
      assert.ok(linkedin);
      assert.equal(linkedin.source_type, 'linkedin');
      assert.equal(linkedin.ingest_status, 'enriched');
      assert.equal(linkedin.author, 'George Diab');

      const reddit = context.itemRepository.findById(redditItem.id);
      assert.ok(reddit);
      assert.equal(reddit.source_type, 'reddit');
      assert.equal(reddit.canonical_url, 'https://www.reddit.com/comments/abc123');
      assert.equal(reddit.ingest_status, 'enriched');
      assert.equal(reddit.title, 'Shipping local-first memory for agents');
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});
