import assert from 'node:assert/strict';
import test from 'node:test';
import { ArticleAdapter } from '../../src/adapters/article-adapter.js';

test('ArticleAdapter parses metadata and chunks from html', async () => {
  const adapter = new ArticleAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      `
      <html>
        <head>
          <title>Example Article</title>
          <meta name="author" content="Jane Doe" />
          <meta property="article:published_time" content="2026-02-24T00:00:00Z" />
        </head>
        <body>
          <p>First paragraph with meaningful content for extraction.</p>
          <p>Second paragraph with additional detail and context for the parser.</p>
        </body>
      </html>
      `,
      { status: 200, headers: { 'content-type': 'text/html' } }
    );

  try {
    const result = await adapter.fetchAndParse({ url: 'https://example.com/post' });

    assert.equal(result.metadata.title, 'Example Article');
    assert.equal(result.metadata.author, 'Jane Doe');
    assert.equal(result.metadata.publishedAt, '2026-02-24T00:00:00Z');
    assert.equal(result.chunks.length > 0, true);
    assert.equal(typeof result.checksum, 'string');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ArticleAdapter fails on empty body', async () => {
  const adapter = new ArticleAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response('', { status: 200, headers: { 'content-type': 'text/html' } });

  try {
    await assert.rejects(() => adapter.fetchAndParse({ url: 'https://example.com/empty' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
