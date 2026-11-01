import type { DB } from '../server/storage';
export const snapshotTables = [
  'schema_migrations',
  'seed_metadata',
  'users',
  'sessions',
  'categories',
  'rules',
  'exercises',
  'lessons',
  'progress',
  'answers',
  'lesson_completions',
  'teacher',
  'audit_log',
  'servers',
  'server_members',
  'invites',
  'rooms',
  'room_members',
  'game_sessions',
  'game_players',
  'game_votes',
  'game_results',
  'messages',
];
export function importSnapshot(db: DB, snapshot: Record<string, any[]>) {
  if (db.prepare("SELECT 1 FROM seed_metadata WHERE key='cloudflare-import-v1'").get())
    throw new Error('Snapshot already imported');
  if (db.prepare('SELECT count(*) n FROM users').get().n)
    throw new Error('Destination already contains accounts');
  if (
    Object.keys(snapshot).length !== snapshotTables.length ||
    snapshotTables.some((t) => !Array.isArray(snapshot[t]))
  )
    throw new Error('Invalid snapshot');
  db.transactionSync!(() => {
    db.exec('PRAGMA defer_foreign_keys=ON');
    for (const table of [...snapshotTables].reverse()) db.exec(`DELETE FROM "${table}"`);
    for (const table of snapshotTables) {
      const columns = db
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((r) => r.name);
      const insert = db.prepare(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
      );
      for (const row of snapshot[table]) {
        if (columns.some((c) => !Object.hasOwn(row, c))) throw new Error('Missing column');
        insert.run(...columns.map((c) => row[c]));
      }
    }
    db.prepare('INSERT INTO seed_metadata VALUES(?,?)').run('cloudflare-import-v1', new Date().toISOString());
  });
  return { users: snapshot.users.length, rooms: snapshot.rooms.length };
}
