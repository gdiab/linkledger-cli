export type SourceType = 'article' | 'x' | 'youtube' | 'pdf' | 'bluesky' | 'linkedin' | 'unknown';
export type IngestStatus = 'metadata_saved' | 'parsed' | 'enriched' | 'failed';
export type AnnotationType = 'highlight' | 'lowlight' | 'note';

export interface Item {
  id: string;
  canonical_url: string;
  original_url: string;
  source_type: SourceType;
  title: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string | null;
  ingest_status: IngestStatus;
  ingest_error: string | null;
  checksum: string | null;
  created_at: string;
  updated_at: string;
}

export interface Annotation {
  id: string;
  item_id: string;
  chunk_id: string | null;
  type: AnnotationType;
  text: string;
  actor: string;
  confidence: number | null;
  pinned: number;
  created_at: string;
}

export interface Tag {
  id: string;
  item_id: string;
  tag: string;
  actor: string;
  created_at: string;
}
