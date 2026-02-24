import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { detectSourceType } from '../lib/url.js';
import type { AdapterParseResult, SourceAdapter } from './source-adapter.js';

const MAX_CHUNK_CHARS = 1200;

const stripHtml = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

const readTagText = (html: string, tag: string): string | undefined => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = html.match(regex);
  if (!match) {
    return undefined;
  }
  return stripHtml(match[1]).trim() || undefined;
};

const readMetaContent = (html: string, names: string[]): string | undefined => {
  for (const name of names) {
    const regex = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    );
    const match = html.match(regex);
    if (match?.[1]) {
      return stripHtml(match[1]).trim() || undefined;
    }
  }

  return undefined;
};

const splitIntoParagraphs = (html: string): string[] => {
  const paragraphMatches = html.match(/<(p|li|blockquote)[^>]*>[\s\S]*?<\/(p|li|blockquote)>/gi) ?? [];
  const paragraphs = paragraphMatches
    .map((segment) => stripHtml(segment))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 20);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  const fallback = stripHtml(html);
  return fallback
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30);
};

const chunkParagraphs = (paragraphs: string[]): Array<{ text: string; tokenCount: number }> => {
  const chunks: Array<{ text: string; tokenCount: number }> = [];
  let buffer = '';

  const flush = () => {
    const text = buffer.trim();
    if (!text) {
      return;
    }

    chunks.push({
      text,
      tokenCount: text.split(/\s+/).length
    });
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length > MAX_CHUNK_CHARS && buffer) {
      flush();
      buffer = paragraph;
      continue;
    }

    if (paragraph.length > MAX_CHUNK_CHARS) {
      flush();
      for (let i = 0; i < paragraph.length; i += MAX_CHUNK_CHARS) {
        const slice = paragraph.slice(i, i + MAX_CHUNK_CHARS).trim();
        if (!slice) {
          continue;
        }
        chunks.push({ text: slice, tokenCount: slice.split(/\s+/).length });
      }
      buffer = '';
      continue;
    }

    buffer = candidate;
  }

  flush();
  return chunks;
};

export class ArticleAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'article';
  }

  detectType(url: string): 'article' | 'x' | 'youtube' | 'pdf' | 'unknown' {
    return detectSourceType(url);
  }

  async fetchAndParse(input: { url: string }): Promise<AdapterParseResult> {
    const response = await fetch(input.url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'linkledger-cli/0.1.0'
      }
    });

    if (!response.ok) {
      throw new AppError('FETCH_FAILED', `Fetch failed for ${input.url} (${response.status})`, true);
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const body = await response.text();
    if (!body.trim()) {
      throw new AppError('PARSE_FAILED', 'Fetched response body was empty', true);
    }

    const isHtml = contentType.includes('text/html') || body.includes('<html');
    const title = isHtml ? readTagText(body, 'title') : undefined;
    const author = isHtml ? readMetaContent(body, ['author', 'article:author']) : undefined;
    const publishedAt = isHtml
      ? readMetaContent(body, ['article:published_time', 'og:published_time', 'date'])
      : undefined;

    const paragraphs = splitIntoParagraphs(body);
    const chunks = chunkParagraphs(paragraphs);

    if (chunks.length === 0) {
      throw new AppError('PARSE_FAILED', 'No article text could be extracted from source', false);
    }

    const normalizedText = chunks.map((chunk) => chunk.text).join('\n');
    const checksum = createHash('sha256').update(normalizedText).digest('hex');

    return {
      metadata: {
        title,
        author,
        publishedAt
      },
      chunks,
      checksum,
      fetchedAt: new Date().toISOString()
    };
  }
}
