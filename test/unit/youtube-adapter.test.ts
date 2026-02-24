import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { YouTubeAdapter } from '../../src/adapters/youtube-adapter.js';

const fixture = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'youtube', name), 'utf8');

test('YouTubeAdapter parses oEmbed and watch metadata into chunk text', async () => {
  const adapter = new YouTubeAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.includes('/oembed')) {
      return new Response(fixture('oembed.json'), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(fixture('watch.html'), {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
  };

  try {
    const result = await adapter.fetchAndParse({ url: 'https://www.youtube.com/watch?v=abc123' });

    assert.equal(result.metadata.title, 'Building Agent Memory Systems');
    assert.equal(result.metadata.author, 'LinkLedger Labs');
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0]?.text.includes('compact evidence packs'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
