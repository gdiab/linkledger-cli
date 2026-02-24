import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { withTempDb } from '../helpers/temp-db.js';

const cliPath = path.join(process.cwd(), 'src', 'cli', 'index.ts');

const runCli = (args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync('node', ['--import', 'tsx', cliPath, ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8'
  });

test('json success and error envelopes are stable', async () => {
  await withTempDb(async (dbPath) => {
    const env = {
      ...process.env,
      LINKLEDGER_DB_PATH: dbPath
    };

    const save = runCli(['save', 'https://example.com/json-contract', '--json'], env);
    assert.equal(save.status, 0);
    const successEnvelope = JSON.parse(save.stdout.trim()) as {
      ok: boolean;
      data: { item: { id: string } };
      meta: { timestamp: string; version: string };
    };

    assert.equal(successEnvelope.ok, true);
    assert.equal(typeof successEnvelope.meta.timestamp, 'string');
    assert.equal(typeof successEnvelope.meta.version, 'string');
    assert.equal(typeof successEnvelope.data.item.id, 'string');

    const error = runCli(['status', 'itm_missing', '--json'], env);
    assert.equal(error.status, 1);
    const errorEnvelope = JSON.parse(error.stdout.trim()) as {
      ok: boolean;
      error: { code: string; message: string; retryable: boolean };
    };

    assert.equal(errorEnvelope.ok, false);
    assert.equal(errorEnvelope.error.code, 'ITEM_NOT_FOUND');
    assert.equal(typeof errorEnvelope.error.message, 'string');
    assert.equal(typeof errorEnvelope.error.retryable, 'boolean');
  });
});
