import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PdfAdapter } from '../../src/adapters/pdf-adapter.js';

const fixture = (name: string): Buffer =>
  readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'pdf', name));

test('PdfAdapter extracts text chunks from text-native fixture', async () => {
  const adapter = new PdfAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(fixture('text-native.pdf'), {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    });

  try {
    const result = await adapter.fetchAndParse({ url: 'https://example.com/whitepaper.pdf' });

    assert.equal(result.metadata.title, 'whitepaper.pdf');
    assert.equal(result.chunks.length > 0, true);
    assert.equal(result.chunks[0]?.text.includes('Hello PDF adapter text for extraction.'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PdfAdapter fails when extracted text is low-signal', async () => {
  const adapter = new PdfAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(Buffer.from('%PDF-1.1\n1 0 obj\n<<>>\nendobj\n%%EOF', 'latin1'), {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    });

  try {
    await assert.rejects(() => adapter.fetchAndParse({ url: 'https://example.com/scan.pdf' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
