import type Database from 'better-sqlite3';

export interface Artifact {
  id: string;
  item_id: string;
  summary: string | null;
  key_claims_json: string | null;
  created_by: string;
  created_at: string;
}

interface UpsertArtifactInput {
  id: string;
  itemId: string;
  summary: string | null;
  keyClaimsJson: string | null;
  createdBy: string;
  createdAt: string;
}

export class ArtifactRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(input: UpsertArtifactInput): Artifact {
    this.db
      .prepare(
        `INSERT INTO artifacts(id, item_id, summary, key_claims_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_id)
         DO UPDATE SET
           summary = excluded.summary,
           key_claims_json = excluded.key_claims_json,
           created_by = excluded.created_by,
           created_at = excluded.created_at`
      )
      .run(input.id, input.itemId, input.summary, input.keyClaimsJson, input.createdBy, input.createdAt);

    return this.findByItemId(input.itemId)!;
  }

  findByItemId(itemId: string): Artifact | undefined {
    return this.db.prepare('SELECT * FROM artifacts WHERE item_id = ?').get(itemId) as Artifact | undefined;
  }
}
