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

test('ArticleAdapter strips class-selector artifacts from HTML attributes', async () => {
  const adapter = new ArticleAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      `
      <html>
        <head><title>The dark factory is not the point</title></head>
        <body>
          <ul class="hidden sm:mt-0 sm:ml-0 [&#38;>li>a]:block [&#38;>li>a]:px-4 [&#38;>li>a]:py-3">
            <li><a href="/">Home</a></li>
          </ul>
          <article>
            <p>The dark factory is not the point. Teams still need judgment and design ownership.</p>
          </article>
        </body>
      </html>
      `,
      { status: 200, headers: { 'content-type': 'text/html' } }
    );

  try {
    const result = await adapter.fetchAndParse({ url: 'https://example.com/dark-factory' });
    const combined = result.chunks.map((chunk) => chunk.text).join('\n');

    assert.equal(combined.includes('[&>li>a]'), false);
    assert.equal(combined.includes('&#38;'), false);
    assert.match(combined, /Teams still need judgment and design ownership\./);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
