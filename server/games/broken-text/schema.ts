import type {DB} from '../../storage';
export function migrate(db:DB):void{db.exec(`
CREATE TABLE IF NOT EXISTS rr_broken_text_schema(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO rr_broken_text_schema VALUES(1);
CREATE TABLE IF NOT EXISTS rr_broken_text_rooms(id TEXT PRIMARY KEY,server_id TEXT NOT NULL,name TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rr_broken_text_members(room_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(room_id,user_id));
CREATE TABLE IF NOT EXISTS rr_broken_text_commands(user_id TEXT NOT NULL,command_id TEXT NOT NULL,room_id TEXT NOT NULL,PRIMARY KEY(user_id,command_id));
CREATE TABLE IF NOT EXISTS rr_broken_text_results(session_id TEXT PRIMARY KEY,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rr_broken_text_content(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
`);}
