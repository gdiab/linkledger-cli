import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const withTempDb = async <T>(fn: (dbPath: string) => Promise<T> | T): Promise<T> => {
  const dir = mkdtempSync(path.join(tmpdir(), 'linkledger-test-'));
  const dbPath = path.join(dir, 'linkledger.db');
  const previous = process.env.LINKLEDGER_DB_PATH;
  process.env.LINKLEDGER_DB_PATH = dbPath;

  try {
    return await fn(dbPath);
  } finally {
    if (previous === undefined) {
      delete process.env.LINKLEDGER_DB_PATH;
    } else {
      process.env.LINKLEDGER_DB_PATH = previous;
    }

    rmSync(dir, { recursive: true, force: true });
  }
};
