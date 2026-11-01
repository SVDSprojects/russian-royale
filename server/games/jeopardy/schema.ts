import type { DB } from "../../storage";
import { transaction } from "../../storage";
export function migrate(db: DB): void {
  transaction(db, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS rr_jeopardy_schema (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rr_jeopardy_rooms (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL, deadline INTEGER, active INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS rr_jeopardy_rooms_server ON rr_jeopardy_rooms(server_id);
 CREATE TABLE IF NOT EXISTS rr_jeopardy_participants (room_id TEXT NOT NULL, user_id TEXT NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(room_id,user_id));
 CREATE TABLE IF NOT EXISTS rr_jeopardy_commands (user_id TEXT NOT NULL, command_id TEXT NOT NULL, room_id TEXT NOT NULL, kind TEXT NOT NULL, response TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,command_id));
 CREATE TABLE IF NOT EXISTS rr_jeopardy_results (session_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, server_id TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rr_jeopardy_content (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL);
 INSERT OR IGNORE INTO rr_jeopardy_schema(id,version) VALUES(1,1);`);
  });
}
