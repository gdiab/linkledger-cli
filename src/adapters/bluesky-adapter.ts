import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { detectSourceType } from '../lib/url.js';
import type { SourceType } from '../lib/types.js';
import type { AdapterParseResult, SourceAdapter } from './source-adapter.js';

const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

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

const parseHandleAndPostId = (url: string): { handle?: string; postId?: string } => {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const profileIdx = parts.indexOf('profile');
  const postIdx = parts.indexOf('post');

  return {
    handle: profileIdx >= 0 ? parts[profileIdx + 1] : undefined,
    postId: postIdx >= 0 ? parts[postIdx + 1] : undefined
  };
};

const toChunks = (text: string): Array<{ text: string; tokenCount: number }> => {
  const normalized = text.trim();
  return normalized ? [{ text: normalized, tokenCount: normalized.split(/\s+/).length }] : [];
};

export class BlueskyAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'bluesky';
  }

  detectType(url: string): SourceType {
    return detectSourceType(url);
  }

  async fetchAndParse(input: { url: string }): Promise<AdapterParseResult> {
    const info = parseHandleAndPostId(input.url);
    const oembedUrl = `https://embed.bsky.app/oembed?url=${encodeURIComponent(input.url)}`;

    let text = '';
    let author: string | undefined = info.handle;
    let publishedAt: string | undefined;

    const oembed = await fetch(oembedUrl, {
      headers: { 'user-agent': 'linkledger-cli/0.1.0' }
    });

    if (oembed.ok) {
      const payload = (await oembed.json()) as {
        html?: string;
        author_name?: string;
        title?: string;
      };
      author = payload.author_name?.trim() || author;
      text = stripHtml(payload.html ?? payload.title ?? '');
    }

    if (!text) {
      const page = await fetch(input.url, {
        redirect: 'follow',
        headers: { 'user-agent': 'linkledger-cli/0.1.0' }
      });

      if (!page.ok) {
        throw new AppError(
          'FETCH_FAILED',
          `Bluesky fetch failed (${page.status}) for ${input.url}`,
          page.status >= 500
        );
      }

      const html = await page.text();
      text = readMetaContent(html, ['description', 'og:description']) ?? stripHtml(html).slice(0, 500);
      author = author ?? readMetaContent(html, ['author']);
      publishedAt = readMetaContent(html, ['article:published_time']);
    }

    if (!text) {
      text = info.postId
        ? `Bluesky post ${info.postId} by ${info.handle ?? 'unknown'} (${input.url})`
        : `Bluesky post (${input.url})`;
    }

    const chunks = toChunks(text);
    if (chunks.length === 0) {
      throw new AppError('PARSE_FAILED', 'No Bluesky post text could be extracted', false);
    }

    return {
      metadata: {
        title: text.slice(0, 140),
        author,
        publishedAt
      },
      chunks,
      checksum: createHash('sha256').update(chunks.map((chunk) => chunk.text).join('\n')).digest('hex'),
      fetchedAt: new Date().toISOString()
    };
  }
}
