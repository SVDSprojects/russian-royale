CREATE TABLE IF NOT EXISTS servers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 owner_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS server_members (
 server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined_at TEXT NOT NULL,
 PRIMARY KEY(server_id,user_id)
);
CREATE TABLE IF NOT EXISTS invites (
 token TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
 created_by TEXT NOT NULL REFERENCES users(id), revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS invites_server ON invites(server_id);
CREATE TABLE IF NOT EXISTS rooms (
 id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
 name TEXT NOT NULL, host_id TEXT NOT NULL REFERENCES users(id), max_players INTEGER NOT NULL CHECK(max_players BETWEEN 3 AND 30),
 phase TEXT NOT NULL DEFAULT 'lobby' CHECK(phase IN ('lobby','discussion','voting','guess','finished')),
 discussion_seconds INTEGER NOT NULL, vote_seconds INTEGER NOT NULL, guess_seconds INTEGER NOT NULL,
 deadline INTEGER, session_id TEXT, round INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_server ON rooms(server_id);
CREATE TABLE IF NOT EXISTS room_members (
 room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, ready INTEGER NOT NULL DEFAULT 0,
 joined_at TEXT NOT NULL, last_seen INTEGER NOT NULL, left_at INTEGER,
 PRIMARY KEY(room_id,user_id)
);
CREATE TABLE IF NOT EXISTS game_sessions (
 id TEXT PRIMARY KEY, room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
 topic_title TEXT NOT NULL, topic_category TEXT NOT NULL, topic_snapshot TEXT NOT NULL,
 spy_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, finished_at TEXT,
 winner TEXT CHECK(winner IN ('spy','citizens')), reason TEXT, guess TEXT
);
CREATE TABLE IF NOT EXISTS game_players (
 session_id TEXT NOT NULL REFERENCES game_sessions(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('spy','citizen')), PRIMARY KEY(session_id,user_id)
);
CREATE TABLE IF NOT EXISTS game_votes (
 session_id TEXT NOT NULL REFERENCES game_sessions(id), voter_id TEXT NOT NULL REFERENCES users(id),
 target_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 PRIMARY KEY(session_id,voter_id),
 FOREIGN KEY(session_id,voter_id) REFERENCES game_players(session_id,user_id),
 FOREIGN KEY(session_id,target_id) REFERENCES game_players(session_id,user_id)
);
CREATE TABLE IF NOT EXISTS game_results (
 session_id TEXT NOT NULL REFERENCES game_sessions(id), user_id TEXT NOT NULL REFERENCES users(id),
 win INTEGER NOT NULL CHECK(win IN (0,1)), xp INTEGER NOT NULL, topic_title TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(session_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_room ON messages(room_id,created_at);
CREATE INDEX IF NOT EXISTS results_user ON game_results(user_id,created_at);
CREATE INDEX IF NOT EXISTS room_members_user ON room_members(user_id);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,datetime('now'));
