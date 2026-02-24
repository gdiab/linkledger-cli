import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { XAdapter } from '../../src/adapters/x-adapter.js';

const fixture = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'x', name), 'utf8');

test('XAdapter parses oEmbed payload into chunks', async () => {
  const adapter = new XAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(fixture('oembed.json'), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

  try {
    const result = await adapter.fetchAndParse({ url: 'https://x.com/georgediab/status/123456' });
    assert.equal(result.metadata.author, 'georgediab');
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0]?.text.includes('local-first agent memory systems'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
