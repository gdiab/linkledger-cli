import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { detectSourceType } from '../lib/url.js';
import type { AdapterParseResult, SourceAdapter } from './source-adapter.js';

const readMetaDescription = (html: string): string | undefined => {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return match?.[1]?.trim();
};

const parseVideoId = (url: string): string | undefined => {
  const parsed = new URL(url);

  if (parsed.hostname === 'youtu.be') {
    return parsed.pathname.split('/').filter(Boolean)[0];
  }

  const direct = parsed.searchParams.get('v');
  if (direct) {
    return direct;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const shortsIndex = parts.indexOf('shorts');
  if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
    return parts[shortsIndex + 1];
  }

  return undefined;
};

const buildChunks = (title: string | undefined, channel: string | undefined, description: string | undefined): Array<{ text: string; tokenCount: number }> => {
  const lines = [title, channel ? `Channel: ${channel}` : undefined, description]
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry));

  const text = lines.join('\n\n').trim();
  if (!text) {
    return [];
  }

  return [{ text, tokenCount: text.split(/\s+/).length }];
};

export class YouTubeAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'youtube';
  }

  detectType(url: string): 'article' | 'x' | 'youtube' | 'pdf' | 'unknown' {
    return detectSourceType(url);
  }

  async fetchAndParse(input: { url: string }): Promise<AdapterParseResult> {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(input.url)}&format=json`;

    let title: string | undefined;
    let author: string | undefined;
    let description: string | undefined;

    const oembedResponse = await fetch(oembedUrl, {
      headers: { 'user-agent': 'linkledger-cli/0.1.0' }
    });

    if (oembedResponse.ok) {
      const payload = (await oembedResponse.json()) as { title?: string; author_name?: string };
      title = payload.title?.trim();
      author = payload.author_name?.trim();
    } else {
      throw new AppError('FETCH_FAILED', `YouTube oEmbed fetch failed (${oembedResponse.status})`, true);
    }

    const watchResponse = await fetch(input.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'linkledger-cli/0.1.0' }
    });

    if (watchResponse.ok) {
      description = readMetaDescription(await watchResponse.text());
    }

    const chunks = buildChunks(title, author, description);
    if (chunks.length === 0) {
      const videoId = parseVideoId(input.url) ?? 'unknown';
      const fallback = `YouTube video ${videoId} (${input.url})`;
      return {
        metadata: {
          title: title ?? fallback,
          author
        },
        chunks: [{ text: fallback, tokenCount: fallback.split(/\s+/).length }],
        checksum: createHash('sha256').update(fallback).digest('hex'),
        fetchedAt: new Date().toISOString()
      };
    }

    return {
      metadata: {
        title,
        author
      },
      chunks,
      checksum: createHash('sha256').update(chunks.map((chunk) => chunk.text).join('\n')).digest('hex'),
      fetchedAt: new Date().toISOString()
    };
  }
}
