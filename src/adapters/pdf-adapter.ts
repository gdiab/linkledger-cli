import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { detectSourceType } from '../lib/url.js';
import type { SourceType } from '../lib/types.js';
import type { AdapterParseResult, SourceAdapter } from './source-adapter.js';

const MAX_CHUNK_CHARS = 1200;

const decodePdfString = (literal: string): string => {
  const body = literal.slice(1, -1);
  let out = '';

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (char !== '\\') {
      out += char;
      continue;
    }

    const next = body[i + 1];
    if (next === undefined) {
      break;
    }

    if (next === 'n') {
      out += '\n';
      i += 1;
      continue;
    }

    if (next === 'r') {
      out += '\r';
      i += 1;
      continue;
    }

    if (next === 't') {
      out += '\t';
      i += 1;
      continue;
    }

    if (next === 'b') {
      out += '\b';
      i += 1;
      continue;
    }

    if (next === 'f') {
      out += '\f';
      i += 1;
      continue;
    }

    out += next;
    i += 1;
  }

  return out;
};

const parsePdfText = (buffer: Buffer): string => {
  const raw = buffer.toString('latin1');
  const segments: string[] = [];

  const tjRegex = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  for (const match of raw.matchAll(tjRegex)) {
    const literal = match[0].replace(/\s*Tj$/, '').trim();
    const decoded = decodePdfString(literal).trim();
    if (decoded) {
      segments.push(decoded);
    }
  }

  const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
  for (const match of raw.matchAll(tjArrayRegex)) {
    const inner = match[1] ?? '';
    const literalRegex = /\((?:\\.|[^\\)])*\)/g;
    for (const literalMatch of inner.matchAll(literalRegex)) {
      const decoded = decodePdfString(literalMatch[0]).trim();
      if (decoded) {
        segments.push(decoded);
      }
    }
  }

  return segments.join(' ').replace(/\s+/g, ' ').trim();
};

const chunkText = (text: string): Array<{ text: string; tokenCount: number }> => {
  const chunks: Array<{ text: string; tokenCount: number }> = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
    const piece = text.slice(i, i + MAX_CHUNK_CHARS).trim();
    if (!piece) {
      continue;
    }
    chunks.push({
      text: piece,
      tokenCount: piece.split(/\s+/).length
    });
  }

  return chunks;
};

const titleFromUrl = (url: string): string => {
  const parsed = new URL(url);
  const lastSegment = parsed.pathname.split('/').filter(Boolean).at(-1);
  if (!lastSegment) {
    return 'document.pdf';
  }

  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
};

export class PdfAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'pdf';
  }

  detectType(url: string): SourceType {
    return detectSourceType(url);
  }

  async fetchAndParse(input: { url: string }): Promise<AdapterParseResult> {
    const response = await fetch(input.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'linkledger-cli/0.1.0' }
    });

    if (!response.ok) {
      throw new AppError('FETCH_FAILED', `PDF fetch failed (${response.status})`, true);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new AppError('PARSE_FAILED', 'PDF response body was empty', true);
    }

    const extracted = parsePdfText(buffer);
    if (extracted.length < 20) {
      throw new AppError('PARSE_FAILED', 'PDF text extraction returned low signal content', false);
    }

    const chunks = chunkText(extracted);
    return {
      metadata: {
        title: titleFromUrl(input.url)
      },
      chunks,
      checksum: createHash('sha256').update(chunks.map((chunk) => chunk.text).join('\n')).digest('hex'),
      fetchedAt: new Date().toISOString()
    };
  }
}
