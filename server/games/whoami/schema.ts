// Идемпотентная миграция собственных таблиц rr_whoami_*. Рабочие данные не удаляются.

import type { DB } from "../../storage";

export const SCHEMA_VERSION = 1;

const V1 = `
CREATE TABLE IF NOT EXISTS rr_whoami_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rr_whoami_rooms (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  host_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  deadline_ms INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rr_whoami_rooms_server ON rr_whoami_rooms (server_id, status, updated_at);
CREATE INDEX IF NOT EXISTS rr_whoami_rooms_deadline ON rr_whoami_rooms (status, deadline_ms);
CREATE TABLE IF NOT EXISTS rr_whoami_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  phase TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rr_whoami_sessions_room ON rr_whoami_sessions (room_id, created_at);
CREATE TABLE IF NOT EXISTS rr_whoami_members (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  username TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS rr_whoami_commands (
  user_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  version_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, command_id)
);
CREATE TABLE IF NOT EXISTS rr_whoami_results (
  session_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rr_whoami_scores (
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  is_winner INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS rr_whoami_scores_user ON rr_whoami_scores (user_id, created_at);
CREATE TABLE IF NOT EXISTS rr_whoami_content (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
`;

function currentVersion(db: DB): number {
  db.exec("CREATE TABLE IF NOT EXISTS rr_whoami_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row: unknown = db.prepare("SELECT value FROM rr_whoami_meta WHERE key = ?").get("schemaVersion");
  if (typeof row !== "object" || row === null || !("value" in row)) return 0;
  const parsed = Number(row.value);
  return Number.isInteger(parsed) ? parsed : 0;
}

export function migrate(db: DB): void {
  const version = currentVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new Error(`Схема rr_whoami новее модуля (${version} > ${SCHEMA_VERSION})`);
  }
  if (version < 1) db.exec(V1);
  db.prepare("INSERT INTO rr_whoami_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "schemaVersion",
    String(SCHEMA_VERSION),
  );
}
