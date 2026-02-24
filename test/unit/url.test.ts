import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeUrl, detectSourceType } from '../../src/lib/url.js';

test('canonicalizeUrl strips tracking params and normalizes host/path', () => {
  const input = 'HTTPS://Example.com/path/?utm_source=x&b=2&a=1#frag';
  const output = canonicalizeUrl(input);

  assert.equal(output, 'https://example.com/path?a=1&b=2');
});

test('detectSourceType detects x/youtube/pdf/bluesky/linkedin/article', () => {
  assert.equal(detectSourceType('https://x.com/user/status/123'), 'x');
  assert.equal(detectSourceType('https://www.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(detectSourceType('https://example.com/doc.pdf'), 'pdf');
  assert.equal(detectSourceType('https://bsky.app/profile/georgediab.com/post/3kabc'), 'bluesky');
  assert.equal(detectSourceType('https://www.linkedin.com/posts/gdiab_post-example'), 'linkedin');
  assert.equal(detectSourceType('https://example.com/blog/post'), 'article');
});
