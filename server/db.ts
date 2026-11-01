import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DB } from './storage.js';
export { type DB, transaction } from './storage.js';
export function createDatabase(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(fileURLToPath(new URL('../migrations/001-foundation.sql', import.meta.url)), 'utf8'));
  return db as unknown as DB;
}
export function migrateMultiplayer(db: DB) {
  db.exec(readFileSync(fileURLToPath(new URL('../migrations/002-multiplayer.sql', import.meta.url)), 'utf8'));
}
