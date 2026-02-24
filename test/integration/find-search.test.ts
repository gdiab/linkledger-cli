import assert from 'node:assert/strict';
import test from 'node:test';
import { AnnotationService } from '../../src/services/annotation-service.js';
import { createServiceContext } from '../../src/services/context.js';
import { FindService } from '../../src/services/find-service.js';
import { IngestWorkerService } from '../../src/services/ingest-worker-service.js';
import { SaveService } from '../../src/services/save-service.js';
import { withTempDb } from '../helpers/temp-db.js';

test('find ranks pinned high-confidence annotations above low-confidence annotations', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/a')) {
        return new Response(
          '<html><head><title>Alpha</title></head><body><p>Content about research workflows.</p></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }

      return new Response(
        '<html><head><title>Beta</title></head><body><p>Content about research workflows.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    };

    try {
      const saveService = new SaveService(context);
      const annService = new AnnotationService(context);
      const worker = new IngestWorkerService(context);
      const find = new FindService(context);

      const itemA = saveService.execute({ url: 'https://example.com/a', tags: ['m1'] }).item;
      const itemB = saveService.execute({ url: 'https://example.com/b', tags: ['m1'] }).item;

      await worker.runOnce({ limit: 10, maxAttempts: 3 });

      annService.execute({
        itemId: itemA.id,
        type: 'highlight',
        text: 'weighted ranking evidence snippet',
        actor: 'agent:researcher',
        confidence: 0.94,
        pin: true
      });

      annService.execute({
        itemId: itemB.id,
        type: 'highlight',
        text: 'weighted ranking evidence snippet',
        actor: 'agent:researcher',
        confidence: 0.32,
        pin: false
      });

      const ranked = find.execute({ query: 'weighted ranking evidence', limit: 10 });
      assert.equal(ranked.length, 2);
      assert.equal(ranked[0]?.id, itemA.id);
      assert.equal(ranked[1]?.id, itemB.id);
      assert.equal(ranked[0]?.why_ranked.pinned_boost > ranked[1]?.why_ranked.pinned_boost, true);
      assert.equal(
        ranked[0]?.why_ranked.low_confidence_penalty < ranked[1]?.why_ranked.low_confidence_penalty,
        true
      );

      const filtered = find.execute({ query: 'weighted ranking evidence', tags: ['m1'], limit: 10 });
      assert.equal(filtered.length, 2);

      const sinceFilteredOut = find.execute({ query: 'weighted ranking evidence', since: '2099-01-01', limit: 10 });
      assert.equal(sinceFilteredOut.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});

test('find matches parsed chunk text and source type filters', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(
        '<html><head><title>Chunk Match</title></head><body><p>Token efficient retrieval memory for agents.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      );

    try {
      const saveService = new SaveService(context);
      const worker = new IngestWorkerService(context);
      const find = new FindService(context);

      const article = saveService.execute({ url: 'https://example.com/chunk-match' }).item;
      saveService.execute({ url: 'https://www.youtube.com/watch?v=testvideo' });

      await worker.runOnce({ limit: 10, maxAttempts: 3 });

      const results = find.execute({ query: 'token efficient retrieval', sourceType: 'article', limit: 10 });
      assert.equal(results.length, 1);
      assert.equal(results[0]?.id, article.id);
      assert.equal(results[0]?.snippet !== null, true);
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});
