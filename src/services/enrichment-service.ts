import { createRandomishId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import type { ServiceContext } from './context.js';

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1).trimEnd()}…`;
};

export class EnrichmentService {
  constructor(private readonly context: ServiceContext) {}

  enrichItem(itemId: string): { summary: string | null; key_claims: string[] } {
    const item = this.context.itemRepository.findById(itemId);
    if (!item) {
      return { summary: null, key_claims: [] };
    }

    const chunkText = this.context.contentChunkRepository.listTextByItemId(itemId).join('\n\n').trim();
    const annotationText = this.context.annotationRepository
      .listByItemId(itemId)
      .map((entry) => `${entry.type}: ${entry.text}`)
      .join('\n');

    const base = [item.title ?? '', chunkText, annotationText].filter(Boolean).join('\n\n').trim();
    if (!base) {
      this.context.itemRepository.updateStatus(itemId, 'parsed', null, nowIso());
      return { summary: null, key_claims: [] };
    }

    const sentences = splitSentences(base);
    const summary = truncate(sentences.slice(0, 2).join(' '), 320);
    const keyClaims = sentences.slice(0, 5).map((sentence) => truncate(sentence, 220));
    const now = nowIso();

    this.context.artifactRepository.upsert({
      id: createRandomishId('art', itemId),
      itemId,
      summary,
      keyClaimsJson: JSON.stringify(keyClaims),
      createdBy: 'agent:enricher',
      createdAt: now
    });

    this.context.itemRepository.updateStatus(itemId, 'enriched', null, now);
    return { summary, key_claims: keyClaims };
  }
}
