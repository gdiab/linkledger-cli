import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BlueskyAdapter } from '../../src/adapters/bluesky-adapter.js';

const fixture = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'bluesky', name), 'utf8');

test('BlueskyAdapter parses oEmbed payload into chunk text', async () => {
  const adapter = new BlueskyAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('embed.bsky.app/oembed')) {
      return new Response(fixture('oembed.json'), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
  };

  try {
    const result = await adapter.fetchAndParse({
      url: 'https://bsky.app/profile/georgediab.com/post/3kxyz123'
    });

    assert.equal(result.metadata.author, 'George Diab');
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0]?.text.includes('agent memory with durable provenance'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
