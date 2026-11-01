import { it, expect } from 'vitest';
import { createDatabase, migrateMultiplayer, transaction } from '../server/db';
import { seed } from '../server/seed';
import { importSnapshot, snapshotTables } from '../cloudflare/snapshot';
it('imports the entire snapshot atomically and forbids overwriting an imported database', () => {
  const source = createDatabase(':memory:');
  seed(source);
  migrateMultiplayer(source);
  const dest = createDatabase(':memory:');
  seed(dest);
  migrateMultiplayer(dest);
  const snapshot = Object.fromEntries(
    snapshotTables.map((t) => [t, source.prepare(`SELECT * FROM ${t}`).all()]),
  );
  const wrapped = {
    prepare: dest.prepare.bind(dest),
    exec: dest.exec.bind(dest),
    close: dest.close.bind(dest),
    transactionSync: <T>(fn: () => T) => transaction(dest, fn),
  };
  try {
    const invalid = structuredClone(snapshot);
    invalid.rules[0].category_id = 'missing';
    expect(() => importSnapshot(wrapped, invalid)).toThrow();
    expect(dest.prepare('SELECT count(*) n FROM rules').get().n).toBe(1);
    expect(importSnapshot(wrapped, snapshot)).toEqual({ users: 0, rooms: 0 });
    expect(dest.prepare('SELECT id FROM rules').get().id).toBe(
      source.prepare('SELECT id FROM rules').get().id,
    );
    expect(() => importSnapshot(wrapped, snapshot)).toThrow('already imported');
  } finally {
    source.close();
    dest.close();
  }
});
