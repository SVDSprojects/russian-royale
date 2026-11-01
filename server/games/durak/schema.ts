import type { DB } from "../../storage";
import { transaction } from "../../storage";
export function migrate(db: DB): void {
  transaction(db, () => {
    db.exec(`
CREATE TABLE IF NOT EXISTS rr_durak_schema (id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
INSERT OR IGNORE INTO rr_durak_schema(id,version) VALUES(1,1);
CREATE TABLE IF NOT EXISTS rr_durak_rooms (id TEXT PRIMARY KEY,server_id TEXT NOT NULL,name TEXT NOT NULL,host_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS rr_durak_server ON rr_durak_rooms(server_id);
CREATE TABLE IF NOT EXISTS rr_durak_participants (room_id TEXT NOT NULL,server_id TEXT NOT NULL,user_id TEXT NOT NULL,seat INTEGER NOT NULL,username TEXT NOT NULL,ready INTEGER NOT NULL,last_seen INTEGER NOT NULL,PRIMARY KEY(room_id,user_id));
CREATE INDEX IF NOT EXISTS rr_durak_participant_user ON rr_durak_participants(server_id,user_id);
CREATE TABLE IF NOT EXISTS rr_durak_scores (session_id TEXT NOT NULL,room_id TEXT NOT NULL,server_id TEXT NOT NULL,user_id TEXT NOT NULL,score INTEGER NOT NULL,PRIMARY KEY(session_id,user_id));
CREATE TABLE IF NOT EXISTS rr_durak_commands (user_id TEXT NOT NULL,command_id TEXT NOT NULL,room_id TEXT NOT NULL,PRIMARY KEY(user_id,command_id));
CREATE TABLE IF NOT EXISTS rr_durak_results (session_id TEXT PRIMARY KEY,room_id TEXT NOT NULL,server_id TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rr_durak_content (id TEXT PRIMARY KEY,record TEXT NOT NULL);
`);
  });
}
