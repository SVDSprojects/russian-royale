-- SQLite migration 1. Access control is enforced by the sole trusted API process.
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seed_metadata (key TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, username TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('admin','editor','moderator','player')),
 xp INTEGER NOT NULL DEFAULT 0 CHECK(xp>=0), avatar TEXT NOT NULL DEFAULT '🦊', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS rules (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), subcategory TEXT NOT NULL DEFAULT '',
 summary TEXT NOT NULL DEFAULT '', explanation TEXT NOT NULL, examples TEXT NOT NULL DEFAULT '[]', mistakes TEXT NOT NULL DEFAULT '[]',
 images TEXT NOT NULL DEFAULT '[]', difficulty INTEGER NOT NULL DEFAULT 1 CHECK(difficulty BETWEEN 1 AND 3),
 games TEXT NOT NULL DEFAULT '["spy"]', published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rules_publication ON rules(published,category_id);
CREATE TABLE IF NOT EXISTS exercises (
 id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE, type TEXT NOT NULL, prompt TEXT NOT NULL,
 options TEXT NOT NULL DEFAULT '[]', answer TEXT NOT NULL, explanation TEXT NOT NULL DEFAULT '', difficulty INTEGER NOT NULL DEFAULT 1,
 exam_number INTEGER, published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS exercises_rule ON exercises(rule_id,published);
CREATE TABLE IF NOT EXISTS lessons (
 id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE, title TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), blocks TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lessons_rule ON lessons(rule_id,published);
CREATE TABLE IF NOT EXISTS progress (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
 favorite INTEGER NOT NULL DEFAULT 0, learned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,rule_id)
);
CREATE TABLE IF NOT EXISTS answers (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
 rule_id TEXT REFERENCES rules(id) ON DELETE SET NULL, prompt TEXT NOT NULL, topic_title TEXT NOT NULL, submitted TEXT NOT NULL,
 correct INTEGER NOT NULL CHECK(correct IN (0,1)), expected TEXT NOT NULL, explanation TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_user_exercise ON answers(user_id,exercise_id,correct);
CREATE TABLE IF NOT EXISTS lesson_completions (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, title TEXT NOT NULL,
 xp INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id)
);
CREATE TABLE IF NOT EXISTS teacher (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, target_id TEXT,
 details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_recent ON audit_log(created_at);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,datetime('now'));
