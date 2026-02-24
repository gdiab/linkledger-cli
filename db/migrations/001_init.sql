CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  author TEXT,
  published_at TEXT,
  fetched_at TEXT,
  ingest_status TEXT NOT NULL,
  ingest_error TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_chunks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(item_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_id TEXT REFERENCES content_chunks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  actor TEXT NOT NULL,
  confidence REAL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(item_id, tag, actor)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  summary TEXT,
  key_claims_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_source_fetched ON items(source_type, fetched_at);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(ingest_status);
CREATE INDEX IF NOT EXISTS idx_annotations_item_type_created ON annotations(item_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_tags_tag_item ON tags(tag, item_id);
CREATE INDEX IF NOT EXISTS idx_chunks_item_index ON content_chunks(item_id, chunk_index);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  item_id UNINDEXED,
  title,
  chunk_text,
  annotation_text,
  tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
