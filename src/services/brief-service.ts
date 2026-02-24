import type { ServiceContext } from './context.js';
import { FindService } from './find-service.js';

export interface BriefInput {
  query: string;
  maxItems: number;
  expandChunks: boolean;
}

export class BriefService {
  constructor(private readonly context: ServiceContext) {}

  private parseKeyClaims(value: string | null): string[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }

  execute(input: BriefInput) {
    const findService = new FindService(this.context);
    const candidates = findService.execute({
      query: input.query,
      limit: input.maxItems
    });

    return {
      query: input.query,
      items: candidates.map((item) => {
        const highlights = this.context.annotationRepository.listTopByType(item.id, 'highlight', 4);
        const lowlights = this.context.annotationRepository.listTopByType(item.id, 'lowlight', 3);
        const notes = this.context.annotationRepository.listTopByType(item.id, 'note', 3);
        const artifact = this.context.artifactRepository.findByItemId(item.id);
        const keyClaims = this.parseKeyClaims(artifact?.key_claims_json ?? null);

        return {
          item_id: item.id,
          canonical_url: item.canonical_url,
          source_type: item.source_type,
          title: item.title,
          snippet: item.snippet,
          top_highlights: highlights.map((entry) => ({
            text: entry.text,
            actor: entry.actor,
            confidence: entry.confidence
          })),
          top_lowlights: lowlights.map((entry) => ({
            text: entry.text,
            actor: entry.actor,
            confidence: entry.confidence
          })),
          notes: notes.map((entry) => ({
            text: entry.text,
            actor: entry.actor,
            confidence: entry.confidence
          })),
          summary: artifact?.summary ?? null,
          key_claims: keyClaims,
          why_ranked: item.why_ranked,
          expanded_chunks: input.expandChunks ? [] : undefined
        };
      })
    };
  }
}
