import assert from 'node:assert/strict';
import test from 'node:test';
import { BriefService } from '../../src/services/brief-service.js';
import { createServiceContext } from '../../src/services/context.js';
import { IngestWorkerService } from '../../src/services/ingest-worker-service.js';
import { SaveService } from '../../src/services/save-service.js';
import { withTempDb } from '../helpers/temp-db.js';

test('brief includes enriched summary and key_claims', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response(
        '<html><head><title>Evidence Story</title></head><body><p>Claim one about reusable evidence.</p><p>Claim two about compact context.</p></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      );

    try {
      const saveService = new SaveService(context);
      const worker = new IngestWorkerService(context);
      const brief = new BriefService(context);

      saveService.execute({ url: 'https://example.com/evidence-story' });
      await worker.runOnce({ limit: 10, maxAttempts: 3, baseBackoffMs: 0 });

      const result = brief.execute({
        query: 'reusable evidence',
        maxItems: 5,
        expandChunks: false
      });

      assert.equal(result.items.length, 1);
      assert.equal(typeof result.items[0]?.summary, 'string');
      assert.equal(Array.isArray(result.items[0]?.key_claims), true);
      assert.equal((result.items[0]?.key_claims ?? []).length > 0, true);
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});

test('brief key_claims dedupe repeated YouTube text and exclude notes', async () => {
  await withTempDb(async () => {
    const context = createServiceContext();
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/oembed?')) {
        return new Response(
          JSON.stringify({
            title: 'Can you prove AI ROI in Software Eng?',
            author_name: 'AI Engineer'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(
        `
        <html>
          <head>
            <meta name="description" content="Can you prove AI ROI in Software Eng? Can you prove AI ROI in Software Eng? Benchmarks show models can write code in enterprise deployments." />
          </head>
        </html>
        `,
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    };

    try {
      const saveService = new SaveService(context);
      const worker = new IngestWorkerService(context);
      const brief = new BriefService(context);

      saveService.execute({
        url: 'https://www.youtube.com/watch?v=JvosMkuNxF8',
        note: 'smoke test - youtube source'
      });
      await worker.runOnce({ limit: 10, maxAttempts: 3, baseBackoffMs: 0 });

      const result = brief.execute({
        query: 'AI software engineering',
        maxItems: 4,
        expandChunks: false
      });

      const claims = result.items[0]?.key_claims ?? [];
      const normalizedClaims = claims.map((claim) =>
        claim
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
      const titleToken = 'can you prove ai roi in software eng';

      assert.equal(claims.length > 0, true);
      assert.equal(claims.some((claim) => /^note\s*:/i.test(claim)), false);
      assert.equal(new Set(normalizedClaims).size, normalizedClaims.length);
      assert.equal(normalizedClaims.filter((claim) => claim.includes(titleToken)).length <= 1, true);
    } finally {
      globalThis.fetch = originalFetch;
      context.db.close();
    }
  });
});
