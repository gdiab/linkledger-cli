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

const parsePostInfo = (url: string): { username?: string; postId?: string } => {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[1] === 'status') {
    return {
      username: parts[0],
      postId: parts[2]
    };
  }

  return {
    username: parts[0]
  };
};

const chunkForText = (text: string): Array<{ text: string; tokenCount: number }> => {
  const normalized = text.trim();
  return normalized
    ? [{ text: normalized, tokenCount: normalized.split(/\s+/).length }]
    : [];
};

export class XAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'x';
  }

  detectType(url: string): SourceType {
    return detectSourceType(url);
  }

  async fetchAndParse(input: { url: string }): Promise<AdapterParseResult> {
    const info = parsePostInfo(input.url);
    const oembedUrl = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(input.url)}`;

    let extractedText = '';
    let author: string | undefined;

    const oembedResponse = await fetch(oembedUrl, {
      headers: { 'user-agent': 'linkledger-cli/0.1.0' }
    });

    if (oembedResponse.ok) {
      const payload = (await oembedResponse.json()) as { html?: string; author_name?: string };
      author = payload.author_name?.trim() || info.username;
      extractedText = stripHtml(payload.html ?? '');
    } else {
      throw new AppError('FETCH_FAILED', `X oEmbed fetch failed (${oembedResponse.status})`, true);
    }

    if (!extractedText) {
      extractedText = info.postId
        ? `X post ${info.postId} by @${info.username ?? 'unknown'} (${input.url})`
        : `X post (${input.url})`;
    }

    const chunks = chunkForText(extractedText);
    if (chunks.length === 0) {
      throw new AppError('PARSE_FAILED', 'No X post text could be extracted', false);
    }

    return {
      metadata: {
        title: extractedText.slice(0, 140),
        author
      },
      chunks,
      checksum: createHash('sha256').update(chunks.map((chunk) => chunk.text).join('\n')).digest('hex'),
      fetchedAt: new Date().toISOString()
    };
  }
}
