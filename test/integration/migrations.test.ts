import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createServiceContext } from '../../src/services/context.js';
import { SaveService } from '../../src/services/save-service.js';
import { withTempDb } from '../helpers/temp-db.js';

test('migrations are idempotent and preserve existing data', async () => {
  await withTempDb(async () => {
    const contextA = createServiceContext();
    try {
      const saveService = new SaveService(contextA);
      const item = saveService.execute({ url: 'https://example.com/migration-safe' }).item;

      const contextB = createServiceContext();
      try {
        const migrationCount = readdirSync(path.join(process.cwd(), 'db', 'migrations')).filter((entry) =>
          entry.endsWith('.sql')
        ).length;

        const applied = contextB.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
          count: number;
        };
        assert.equal(applied.count, migrationCount);

        const reloaded = contextB.itemRepository.findById(item.id);
        assert.ok(reloaded);
        assert.equal(reloaded.canonical_url, 'https://example.com/migration-safe');
      } finally {
        contextB.db.close();
      }
    } finally {
      contextA.db.close();
    }
  });
});
