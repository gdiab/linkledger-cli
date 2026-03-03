import { createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { extractRedditPostId, isRedditHost } from '../lib/reddit.js';
import { detectSourceType } from '../lib/url.js';
import type { SourceType } from '../lib/types.js';
import type { AdapterParseResult, SourceAdapter } from './source-adapter.js';

const MAX_POST_CHARS = 1800;
const MAX_COMMENT_CHARS = 900;
// limit=8 in the fetch URL over-fetches to buffer for non-comment children
// (e.g. kind:'more' stubs) that get filtered out, ensuring we still collect
// up to MAX_COMMENTS actual t1 comments.
const MAX_COMMENTS = 5;

interface RedditListingChild {
  kind?: string;
  data?: Record<string, unknown>;
}

const toText = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const compact = (value: string): string => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const truncate = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
};

const toTokenCount = (value: string): number => value.split(/\s+/).filter(Boolean).length;

const asListingChildren = (payload: unknown, index: number): RedditListingChild[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const entry = payload[index] as { data?: { children?: RedditListingChild[] } } | undefined;
  if (!entry?.data?.children || !Array.isArray(entry.data.children)) {
    return [];
  }

  return entry.data.children;
};

const toPublishedAt = (value: unknown): string | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return new Date(value * 1000).toISOString();
};

export class RedditAdapter implements SourceAdapter {
  supports(url: string): boolean {
    return this.detectType(url) === 'reddit';
  }

  detectType(url: string): SourceType {
    return detectSourceType(url);
  }

  async fetchAndParse(input: { url: string }): Promise<AdapterParseResult> {
    const parsedUrl = new URL(input.url);
    const postId = extractRedditPostId(parsedUrl.pathname);
    if (!postId) {
      throw new AppError('PARSE_FAILED', `Could not extract Reddit post id from ${input.url}`, false);
    }

    const listingUrl = `https://www.reddit.com/comments/${encodeURIComponent(postId)}.json?raw_json=1&sort=top&limit=8`;
    const response = await fetch(listingUrl, {
      headers: { 'user-agent': 'linkledger-cli/0.1.0' }
    });

    if (!response.ok) {
      throw new AppError(
        'FETCH_FAILED',
        `Reddit listing fetch failed (${response.status}) for ${input.url}`,
        response.status >= 500 || response.status === 429
      );
    }

    const payload = (await response.json()) as unknown;
    const postChild = asListingChildren(payload, 0).find((entry) => entry.kind === 't3');
    const postData = postChild?.data;
    if (!postData) {
      throw new AppError('PARSE_FAILED', 'Reddit listing did not include post payload', false);
    }

    const title = compact(toText(postData.title));
    const author = compact(toText(postData.author)) || undefined;
    const subreddit = compact(toText(postData.subreddit));
    const selfText = compact(toText(postData.selftext));
    const linkedUrl = compact(toText(postData.url));
    let isLinkedReddit = false;
    try { isLinkedReddit = isRedditHost(new URL(linkedUrl).hostname.toLowerCase()); } catch { /* malformed URL */ }

    const postParts = [
      title ? `Title: ${title}` : '',
      subreddit ? `Subreddit: r/${subreddit}` : '',
      author ? `Author: u/${author}` : '',
      selfText ? `Body:\n${selfText}` : '',
      linkedUrl && !isLinkedReddit ? `Linked URL: ${linkedUrl}` : ''
    ].filter(Boolean);

    const chunks: Array<{ text: string; tokenCount: number }> = [];
    if (postParts.length > 0) {
      const postChunk = truncate(postParts.join('\n\n'), MAX_POST_CHARS);
      chunks.push({
        text: postChunk,
        tokenCount: toTokenCount(postChunk)
      });
    }

    const commentChildren = asListingChildren(payload, 1);
    let commentCount = 0;
    for (const comment of commentChildren) {
      if (comment.kind !== 't1') {
        continue;
      }

      const data = comment.data ?? {};
      const body = compact(toText(data.body));
      if (!body) {
        continue;
      }

      const commentAuthor = compact(toText(data.author)) || 'unknown';
      const scoreValue = typeof data.score === 'number' && Number.isFinite(data.score) ? data.score : null;
      const scoreLabel = scoreValue === null ? '' : ` (score ${scoreValue})`;

      commentCount += 1;
      const commentText = truncate(
        `Top comment ${commentCount} by u/${commentAuthor}${scoreLabel}:\n${body}`,
        MAX_COMMENT_CHARS
      );
      chunks.push({
        text: commentText,
        tokenCount: toTokenCount(commentText)
      });

      if (commentCount >= MAX_COMMENTS) {
        break;
      }
    }

    if (chunks.length === 0) {
      throw new AppError('PARSE_FAILED', 'No Reddit text could be extracted', false);
    }

    const fallbackTitle = `Reddit post ${postId}`;
    return {
      metadata: {
        title: title || fallbackTitle,
        author,
        publishedAt: toPublishedAt(postData.created_utc)
      },
      chunks,
      checksum: createHash('sha256').update(chunks.map((chunk) => chunk.text).join('\n')).digest('hex'),
      fetchedAt: new Date().toISOString()
    };
  }
}
