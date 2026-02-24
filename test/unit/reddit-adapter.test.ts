import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { RedditAdapter } from '../../src/adapters/reddit-adapter.js';

const fixture = (name: string): string =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'reddit', name), 'utf8');

test('RedditAdapter parses post text and top comments into chunks', async () => {
  const adapter = new RedditAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(fixture('listing.json'), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

  try {
    const result = await adapter.fetchAndParse({
      url: 'https://www.reddit.com/comments/abc123'
    });

    assert.equal(result.metadata.title, 'Shipping local-first memory for agents');
    assert.equal(result.metadata.author, 'georgediab');
    assert.equal(result.chunks.length, 3);
    assert.equal(result.chunks[0]?.text.includes('Subreddit: r/programming'), true);
    assert.equal(result.chunks[1]?.text.includes('Top comment 1 by u/alice'), true);
    assert.equal(result.chunks[2]?.text.includes('Top comment 2 by u/bob'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RedditAdapter marks upstream failures as retryable for 5xx', async () => {
  const adapter = new RedditAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response('server unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain' }
    });

  try {
    await assert.rejects(
      () => adapter.fetchAndParse({ url: 'https://www.reddit.com/comments/abc123' }),
      (error: unknown) => {
        const typed = error as { code?: string; retryable?: boolean };
        assert.equal(typed.code, 'FETCH_FAILED');
        assert.equal(typed.retryable, true);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
