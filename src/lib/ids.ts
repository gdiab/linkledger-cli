import { createHash } from 'node:crypto';

const stableHash = (input: string): string =>
  createHash('sha256').update(input).digest('hex').slice(0, 20);

export const itemIdFromCanonicalUrl = (canonicalUrl: string): string =>
  `itm_${stableHash(canonicalUrl)}`;

export const createRandomishId = (prefix: string, seed: string): string =>
  `${prefix}_${stableHash(`${seed}:${Date.now()}:${Math.random().toString(16)}`)}`;
