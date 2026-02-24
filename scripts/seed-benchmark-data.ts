import { createHash } from 'node:crypto';
import { createServiceContext } from '../src/services/context.js';
import { nowIso } from '../src/lib/time.js';

const arg = (name: string, fallback: string): string => {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1] as string;
  }
  return fallback;
};

const count = Number.parseInt(arg('--count', '1000'), 10);
const reset = arg('--reset', 'true') === 'true';
const sourceType = arg('--type', 'article');

if (!Number.isFinite(count) || count <= 0) {
  throw new Error('--count must be a positive integer');
}

const context = createServiceContext();

try {
  const tx = context.db.transaction(() => {
    if (reset) {
      context.db.prepare('DELETE FROM annotations').run();
      context.db.prepare('DELETE FROM tags').run();
      context.db.prepare('DELETE FROM artifacts').run();
      context.db.prepare('DELETE FROM content_chunks').run();
      context.db.prepare('DELETE FROM ingest_jobs').run();
      context.db.prepare('DELETE FROM items').run();
      context.db.prepare('DELETE FROM search_fts').run();
    }

    const insertItem = context.db.prepare(
      `INSERT INTO items (
        id, canonical_url, original_url, source_type,
        title, author, published_at, fetched_at,
        ingest_status, ingest_error, checksum, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    );

    const insertChunk = context.db.prepare(
      `INSERT INTO content_chunks(id, item_id, chunk_index, text, token_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const insertAnn = context.db.prepare(
      `INSERT INTO annotations(id, item_id, chunk_id, type, text, actor, confidence, pinned, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
    );

    const insertTag = context.db.prepare(
      `INSERT INTO tags(id, item_id, tag, actor, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );

    const upsertArtifact = context.db.prepare(
      `INSERT INTO artifacts(id, item_id, summary, key_claims_json, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id)
       DO UPDATE SET summary = excluded.summary,
                     key_claims_json = excluded.key_claims_json,
                     created_by = excluded.created_by,
                     created_at = excluded.created_at`
    );

    for (let i = 0; i < count; i += 1) {
      const createdAt = nowIso();
      const id = `itm_bench_${i.toString().padStart(6, '0')}`;
      const canonicalUrl = `https://bench.example.com/${i}`;
      const topic = i % 3 === 0 ? 'agent memory' : i % 3 === 1 ? 'retrieval ranking' : 'source ingestion';
      const title = `Benchmark item ${i} about ${topic}`;
      const chunkA = `This benchmark item ${i} discusses ${topic} workflows, evidence packs, and deterministic retrieval for agents.`;
      const chunkB = `It includes highlights, notes, and metadata for search benchmarks at local scale with sqlite fts5.`;
      const checksum = createHash('sha256').update(`${chunkA}\n${chunkB}`).digest('hex');

      insertItem.run(
        id,
        canonicalUrl,
        canonicalUrl,
        sourceType,
        title,
        'benchmark-generator',
        null,
        createdAt,
        'enriched',
        checksum,
        createdAt,
        createdAt
      );

      insertChunk.run(`chk_${id}_0`, id, 0, chunkA, chunkA.split(/\s+/).length, createdAt);
      insertChunk.run(`chk_${id}_1`, id, 1, chunkB, chunkB.split(/\s+/).length, createdAt);

      insertAnn.run(
        `ann_${id}_h`,
        id,
        'highlight',
        `High signal evidence for ${topic} in item ${i}`,
        'agent:bench',
        0.85,
        i % 7 === 0 ? 1 : 0,
        createdAt
      );
      insertAnn.run(
        `ann_${id}_n`,
        id,
        'note',
        `Note for benchmark ${i}`,
        'human',
        null,
        0,
        createdAt
      );

      insertTag.run(`tag_${id}_core`, id, i % 2 === 0 ? 'core' : 'edge', 'agent:bench', createdAt);
      insertTag.run(`tag_${id}_topic`, id, topic.replace(/\s+/g, '-'), 'agent:bench', createdAt);

      upsertArtifact.run(
        `art_${id}`,
        id,
        `Summary for ${title}`,
        JSON.stringify([
          `${topic} improves drafting quality through reusable evidence.`,
          'Compact retrieval lowers token overhead for iterative writing.'
        ]),
        'agent:bench',
        createdAt
      );
    }
  });

  tx();
  const rebuilt = context.searchIndexRepository.rebuildAll(
    (context.db.prepare('SELECT id, title, canonical_url, original_url FROM items').all() as Array<{
      id: string;
      title: string | null;
      canonical_url: string;
      original_url: string;
    }>).map((item) => {
      const chunks = context.contentChunkRepository.listTextByItemId(item.id);
      const annotations = context.annotationRepository
        .listByItemId(item.id)
        .map((entry) => `${entry.type} ${entry.actor}: ${entry.text}`)
        .join('\n\n');

      return {
        itemId: item.id,
        title: item.title ?? '',
        chunkText: [item.canonical_url, item.original_url, ...chunks].join('\n\n'),
        annotationText: annotations
      };
    })
  );

  void rebuilt;
  process.stdout.write(`Seeded ${count} benchmark items (reset=${reset})\n`);
} finally {
  context.db.close();
}
