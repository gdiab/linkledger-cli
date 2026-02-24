import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { detectSourceType } from '../lib/url.js';
import type { SourceType } from '../lib/types.js';
import type { AdapterParseResult, SourceAdapter } from './source-adapter.js';

const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

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

const readAuthorFromJsonLd = (html: string): string | undefined => {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const innerMatch = script.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!innerMatch?.[1]) {
      continue;
    }

    try {
      const parsed = JSON.parse(innerMatch[1]) as unknown;
      const stack = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of stack) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const author = (entry as { author?: unknown }).author;
        if (author && typeof author === 'object' && !Array.isArray(author)) {
          const name = (author as { name?: unknown }).name;
          if (typeof name === 'string' && name.trim()) {
            return name.trim();
          }
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
};

export class LinkedInAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'linkedin';
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
      throw new AppError(
        'FETCH_FAILED',
        `LinkedIn fetch failed (${response.status}) for ${input.url}`,
        response.status >= 500
      );
    }

    const html = await response.text();
    const title =
      readMetaContent(html, ['og:title', 'twitter:title']) ?? readTagText(html, 'title') ?? 'LinkedIn content';
    const description = readMetaContent(html, ['description', 'og:description']) ?? '';
    const author =
      readMetaContent(html, ['author', 'article:author']) ??
      readAuthorFromJsonLd(html) ??
      readMetaContent(html, ['og:site_name']);
    const publishedAt = readMetaContent(html, ['article:published_time']);

    const text = [title, description].filter(Boolean).join('\n\n').trim() || stripHtml(html).slice(0, 1200);
    if (!text || text.length < 20) {
      throw new AppError('PARSE_FAILED', 'No LinkedIn text could be extracted', false);
    }

    return {
      metadata: {
        title,
        author,
        publishedAt
      },
      chunks: [{ text, tokenCount: text.split(/\s+/).length }],
      checksum: createHash('sha256').update(text).digest('hex'),
      fetchedAt: new Date().toISOString()
    };
  }
}
