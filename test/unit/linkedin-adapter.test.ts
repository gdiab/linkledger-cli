import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { LinkedInAdapter } from '../../src/adapters/linkedin-adapter.js';

const fixture = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'linkedin', name), 'utf8');

test('LinkedInAdapter parses metadata and content into chunk text', async () => {
  const adapter = new LinkedInAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(fixture('page.html'), {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });

  try {
    const result = await adapter.fetchAndParse({
      url: 'https://www.linkedin.com/posts/gdiab_memory-layer-cli'
    });

    assert.equal(result.metadata.title, 'How We Built a CLI Memory Layer');
    assert.equal(result.metadata.author, 'George Diab');
    assert.equal(result.metadata.publishedAt, '2026-02-23T08:00:00Z');
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0]?.text.includes('compact briefs for agent workflows'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
