import type { Express } from 'express';
import type { DB } from './storage';
import { transaction } from './storage';
const modules = [
  'jeopardy',
  'roulette',
  'durak',
  'alias',
  'whoami',
  'impostor',
  'mafia',
  'bunker',
  'broken_text',
] as const;
export function registerGameRewards(app: Express, ctx: { db: DB; now: () => number; broadcast: () => void }) {
  const { db } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS rr_reward_sessions(game_id TEXT NOT NULL,session_id TEXT NOT NULL,PRIMARY KEY(game_id,session_id));
    CREATE TABLE IF NOT EXISTS rr_game_xp(game_id TEXT NOT NULL,session_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),xp INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(game_id,session_id,user_id));`);
  function settle() {
    let changed = false;
    for (const game of modules) {
      const column = ['alias', 'whoami', 'impostor'].includes(game) ? 'result_json' : 'result';
      const pending = db
        .prepare(
          `SELECT session_id,${column} data FROM rr_${game}_results WHERE session_id NOT IN (SELECT session_id FROM rr_reward_sessions WHERE game_id=?) LIMIT 100`,
        )
        .all(game);
      for (const row of pending)
        transaction(db, () => {
          const added = db
            .prepare('INSERT OR IGNORE INTO rr_reward_sessions VALUES(?,?)')
            .run(game, row.session_id);
          if (!added.changes) return;
          const result = JSON.parse(row.data);
          if (result.outcome === 'cancelled') return;
          // Positive game score is evidence of participation; idling through deadlines earns nothing.
          for (const score of result.scores || []) {
            if (score.score <= 0 || !db.prepare('SELECT 1 FROM users WHERE id=?').get(score.userId)) continue;
            const xp = (result.winnerUserIds || []).includes(score.userId) ? 30 : 10;
            db.prepare('INSERT INTO rr_game_xp VALUES(?,?,?,?,?)').run(
              game,
              row.session_id,
              score.userId,
              xp,
              ctx.now(),
            );
            db.prepare('UPDATE users SET xp=xp+? WHERE id=?').run(xp, score.userId);
            changed = true;
          }
        });
    }
    if (changed) ctx.broadcast();
    return changed;
  }
  app.use('/api', (req, res, next) => {
    if (!req.user || !/^\/api\/games\//.test(req.originalUrl || '')) return next();
    const original = res.json.bind(res);
    res.json = ((value: any) => {
      if ((res.statusCode || 200) < 300 && !value?.error) settle();
      return original(value);
    }) as typeof res.json;
    next();
  });
  return settle;
}
