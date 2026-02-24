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
