import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { nowIso } from '../lib/time.js';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.linkledger', 'linkledger.db');

export const resolveDbPath = (): string => process.env.LINKLEDGER_DB_PATH ?? DEFAULT_DB_PATH;

export const openDatabase = (): Database.Database => {
  const dbPath = resolveDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
};

const runMigrations = (db: Database.Database): void => {
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const alreadyApplied = new Set<string>(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => String((row as { name: string }).name))
  );

  for (const file of migrationFiles) {
    if (alreadyApplied.has(file)) {
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)').run(file, nowIso());
    });
    tx();
  }
};
