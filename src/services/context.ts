import type Database from 'better-sqlite3';
import { openDatabase } from '../db/database.js';
import { AnnotationRepository } from '../repositories/annotation-repository.js';
import { ContentChunkRepository } from '../repositories/content-chunk-repository.js';
import { IngestJobRepository } from '../repositories/ingest-job-repository.js';
import { ItemRepository } from '../repositories/item-repository.js';
import { SearchIndexRepository } from '../repositories/search-index-repository.js';
import { TagRepository } from '../repositories/tag-repository.js';

export interface ServiceContext {
  db: Database.Database;
  itemRepository: ItemRepository;
  annotationRepository: AnnotationRepository;
  contentChunkRepository: ContentChunkRepository;
  tagRepository: TagRepository;
  ingestJobRepository: IngestJobRepository;
  searchIndexRepository: SearchIndexRepository;
}

export const createServiceContext = (): ServiceContext => {
  const db = openDatabase();

  return {
    db,
    itemRepository: new ItemRepository(db),
    annotationRepository: new AnnotationRepository(db),
    contentChunkRepository: new ContentChunkRepository(db),
    tagRepository: new TagRepository(db),
    ingestJobRepository: new IngestJobRepository(db),
    searchIndexRepository: new SearchIndexRepository(db)
  };
};
