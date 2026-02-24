const REDDIT_HOST_SUFFIX = '.reddit.com';
const REDDIT_SHORT_HOST_SUFFIX = '.redd.it';

export const isRedditHost = (host: string): boolean => {
  const normalized = host.toLowerCase();
  return (
    normalized === 'reddit.com' ||
    normalized.endsWith(REDDIT_HOST_SUFFIX) ||
    normalized === 'redd.it' ||
    normalized.endsWith(REDDIT_SHORT_HOST_SUFFIX)
  );
};

export const extractRedditPostId = (pathname: string): string | undefined => {
  const parts = pathname
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  if (parts[0] === 'r' && parts[2] === 'comments' && parts[3]) {
    return parts[3].toLowerCase();
  }

  if (parts[0] === 'comments' && parts[1]) {
    return parts[1].toLowerCase();
  }

  if (parts[0] === 'gallery' && parts[1]) {
    return parts[1].toLowerCase();
  }

  return undefined;
};
