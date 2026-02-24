import type { SourceType } from '../lib/types.js';
import type { ServiceContext } from './context.js';
import { StaleRevalidationService } from './stale-revalidation-service.js';

export interface FindInput {
  query: string;
  tags?: string[];
  sourceType?: SourceType;
  since?: string;
  limit: number;
}

export interface FindResultItem {
  id: string;
  canonical_url: string;
  source_type: SourceType;
  title: string | null;
  ingest_status: string;
  updated_at: string;
  tags: string[];
  top_highlights: string[];
  snippet: string | null;
  why_ranked: {
    bm25_score: number;
    pinned_boost: number;
    low_confidence_penalty: number;
    ranking_score: number;
    matched_field: 'annotation' | 'chunk' | 'title' | 'none';
  };
}

const normalizeSnippet = (value: string): string =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^\.\.\.|\.\.\.$/g, '')
    .trim();

export class FindService {
  constructor(private readonly context: ServiceContext) {}

  execute(input: FindInput): FindResultItem[] {
    const staleService = new StaleRevalidationService(this.context);
    const rows = this.context.searchIndexRepository.search({
      query: input.query,
      tags: input.tags,
      sourceType: input.sourceType,
      since: input.since,
      limit: input.limit
    });

    return rows.map((row) => {
      staleService.queueIfStale(row.id);

      const titleSnippet = normalizeSnippet(row.title_snippet ?? '');
      const chunkSnippet = normalizeSnippet(row.chunk_snippet ?? '');
      const annotationSnippet = normalizeSnippet(row.annotation_snippet ?? '');

      const matchedField = annotationSnippet
        ? 'annotation'
        : chunkSnippet
          ? 'chunk'
          : titleSnippet
            ? 'title'
            : 'none';

      const snippet = annotationSnippet || chunkSnippet || titleSnippet || null;

      return {
        id: row.id,
        canonical_url: row.canonical_url,
        source_type: row.source_type,
        title: row.title,
        ingest_status: row.ingest_status,
        updated_at: row.updated_at,
        tags: this.context.tagRepository.listByItemId(row.id).map((tag) => tag.tag),
        top_highlights: this.context.annotationRepository
          .listTopByType(row.id, 'highlight', 3)
          .map((annotation) => annotation.text),
        snippet,
        why_ranked: {
          bm25_score: row.bm25_score,
          pinned_boost: row.pinned_count * 0.2,
          low_confidence_penalty: row.low_conf_count * 0.15,
          ranking_score: row.ranking_score,
          matched_field: matchedField
        }
      };
    });
  }
}
