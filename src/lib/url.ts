import type { SourceType } from './types.js';
import { extractRedditPostId, isRedditHost } from './reddit.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid'
]);

const REDDIT_NOISE_PARAMS = new Set(['context', 'depth', 'sort', 'share_id', 'rdt', 'ref', 'ref_source']);

const normalizeRedditUrl = (parsed: URL, originalHost: string): void => {
  parsed.protocol = 'https:';
  if (originalHost === 'redd.it' || originalHost.endsWith('.redd.it')) {
    const shortId = parsed.pathname
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)[0];
    if (shortId) {
      parsed.pathname = `/comments/${shortId.toLowerCase()}`;
    }
  } else {
    const postId = extractRedditPostId(parsed.pathname);
    if (postId) {
      parsed.pathname = `/comments/${postId}`;
    }
  }

  parsed.hostname = 'www.reddit.com';
  parsed.port = '';
};

export const canonicalizeUrl = (input: string): string => {
  const parsed = new URL(input.trim());
  parsed.hash = '';
  parsed.protocol = parsed.protocol.toLowerCase();
  const originalHost = parsed.hostname.toLowerCase();
  parsed.hostname = originalHost;

  const isReddit = isRedditHost(originalHost);
  if (isReddit) {
    normalizeRedditUrl(parsed, originalHost);
  }

  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
    parsed.port = '';
  }

  const keptEntries = [...parsed.searchParams.entries()]
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      if (TRACKING_PARAMS.has(normalized)) {
        return false;
      }

      if (isReddit && REDDIT_NOISE_PARAMS.has(normalized)) {
        return false;
      }

      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  parsed.search = '';
  for (const [key, value] of keptEntries) {
    parsed.searchParams.append(key, value);
  }

  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
};

export const detectSourceType = (url: string): SourceType => {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();

  if (isRedditHost(host)) {
    return 'reddit';
  }

  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
    return 'x';
  }

  if (host === 'youtu.be' || host.includes('youtube.com')) {
    return 'youtube';
  }

  if (host === 'bsky.app' || host.endsWith('.bsky.app') || host.endsWith('.bsky.social')) {
    return 'bluesky';
  }

  if (host === 'lnkd.in' || host.endsWith('.lnkd.in') || host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    return 'linkedin';
  }

  if (parsed.pathname.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return 'article';
  }

  return 'unknown';
};
