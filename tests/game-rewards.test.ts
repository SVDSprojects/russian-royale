import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
it('all imported games credit earned XP once, skip idle and cancelled games, and fund the shared wallet', async () => {
  const app = createApp({ dbPath: ':memory:', testMode: true });
  try {
    const client = request.agent(app.app);
    const user = (
      await client
        .post('/api/auth/register')
        .send({ username: 'Игрок', email: 'earned@sdvs.test', password: 'Strong-test-password!' })
        .expect(201)
    ).body.user;
    for (const game of [
      'jeopardy',
      'roulette',
      'durak',
      'alias',
      'whoami',
      'impostor',
      'mafia',
      'bunker',
      'broken_text',
    ]) {
      for (const [suffix, outcome, score] of [
        ['win', 'win', 1],
        ['idle', 'win', 0],
        ['cancelled', 'cancelled', 10],
      ] as const) {
        const session = game + '-' + suffix;
        const data = {
          sessionId: session,
          outcome,
          winnerUserIds: [user.id],
          scores: [{ userId: user.id, score }],
        };
        const table = 'rr_' + game + '_results',
          column = ['alias', 'whoami', 'impostor'].includes(game) ? 'result_json' : 'result';
        const available = app.db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((r) => r.name);
        const values: Record<string, unknown> = {
          session_id: session,
          room_id: 'test-room',
          server_id: 'test-server',
          outcome,
          [column]: JSON.stringify(data),
          created_at: Date.now(),
        };
        app.db
          .prepare(
            `INSERT INTO ${table} (${available.join(',')}) VALUES (${available.map(() => '?').join(',')})`,
          )
          .run(...available.map((c) => values[c]));
      }
    }
    app.tick();
    app.tick();
    expect((await client.get('/api/auth/me')).body.user.xp).toBe(270);
    expect((await client.get('/api/collection')).body.balance.available).toBe(270);
    expect(app.db.prepare('SELECT count(*) n FROM rr_game_xp').get().n).toBe(9);
    expect(app.db.prepare('SELECT count(*) n FROM rr_reward_sessions').get().n).toBe(27);
  } finally {
    app.close();
  }
});
