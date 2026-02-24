import { canonicalizeUrl, detectSourceType } from '../lib/url.js';
import { nowIso } from '../lib/time.js';
import type { ServiceContext } from './context.js';
import { SearchIndexService } from './search-index-service.js';

export interface RedditBackfillOptions {
  dryRun?: boolean;
}

export interface RedditBackfillResult {
  dry_run: boolean;
  scanned: number;
  updated: number;
  updated_canonical: number;
  conflicts: number;
  skipped: number;
  conflict_item_ids: string[];
}

interface CandidateRow {
  id: string;
  canonical_url: string;
  original_url: string;
}

const detectRedditCanonical = (candidate: CandidateRow): string | undefined => {
  const inputs = [candidate.canonical_url, candidate.original_url];

  for (const input of inputs) {
    try {
      const canonical = canonicalizeUrl(input);
      if (detectSourceType(canonical) === 'reddit') {
        return canonical;
      }
    } catch {
      continue;
    }
  }

  return undefined;
};

export class RedditBackfillService {
  private readonly indexService: SearchIndexService;

  constructor(private readonly context: ServiceContext) {
    this.indexService = new SearchIndexService(context);
  }

  execute(options: RedditBackfillOptions = {}): RedditBackfillResult {
    const dryRun = options.dryRun ?? false;
    const rows = this.context.db
      .prepare(
        `SELECT id, canonical_url, original_url
         FROM items
         WHERE source_type = 'article'
           AND (
             canonical_url LIKE '%reddit.com/%'
             OR canonical_url LIKE '%redd.it/%'
             OR original_url LIKE '%reddit.com/%'
             OR original_url LIKE '%redd.it/%'
           )
         ORDER BY created_at ASC, id ASC`
      )
      .all() as CandidateRow[];

    const result: RedditBackfillResult = {
      dry_run: dryRun,
      scanned: rows.length,
      updated: 0,
      updated_canonical: 0,
      conflicts: 0,
      skipped: 0,
      conflict_item_ids: []
    };

    const plannedCanonicalOwners = new Map<string, string>();
    const now = nowIso();
    const updates: Array<{ id: string; canonical: string }> = [];

    for (const row of rows) {
      const canonical = detectRedditCanonical(row);
      if (!canonical) {
        result.skipped += 1;
        continue;
      }

      const plannedOwner = plannedCanonicalOwners.get(canonical);
      if (plannedOwner && plannedOwner !== row.id) {
        result.conflicts += 1;
        result.conflict_item_ids.push(row.id);
        continue;
      }

      const collision = this.context.itemRepository.findByCanonicalUrl(canonical);
      if (collision && collision.id !== row.id) {
        result.conflicts += 1;
        result.conflict_item_ids.push(row.id);
        continue;
      }

      plannedCanonicalOwners.set(canonical, row.id);
      result.updated += 1;
      if (canonical !== row.canonical_url) {
        result.updated_canonical += 1;
      }

      updates.push({ id: row.id, canonical });
    }

    if (!dryRun) {
      const tx = this.context.db.transaction(() => {
        const updateStmt = this.context.db.prepare(
          `UPDATE items
           SET source_type = 'reddit',
               canonical_url = @canonical,
               updated_at = @updatedAt
           WHERE id = @id`
        );

        for (const update of updates) {
          updateStmt.run({
            canonical: update.canonical,
            updatedAt: now,
            id: update.id
          });
          this.indexService.syncItem(update.id);
        }
      });

      tx();
    }

    return result;
  }
}
