import type { SourceType } from './types.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid'
]);

export const canonicalizeUrl = (input: string): string => {
  const parsed = new URL(input.trim());
  parsed.hash = '';
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
    parsed.port = '';
  }

  const keptEntries = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
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

  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
    return 'x';
  }

  if (host === 'youtu.be' || host.includes('youtube.com')) {
    return 'youtube';
  }

  if (parsed.pathname.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return 'article';
  }

  return 'unknown';
};
