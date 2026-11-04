import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { streakAt } from '../shared/streak';

it('admins set and reset series without fabricating activity; series continues and expires normally', async () => {
  let now = Date.UTC(2026, 10, 4, 18);
  const app = createApp({ dbPath: ':memory:', testMode: true, now: () => now });
  const clients = [];
  try {
    for (const role of ['admin', 'player', 'moderator', 'editor']) {
      const client = request.agent(app.app);
      const user = (
        await client
          .post('/api/auth/register')
          .send({ email: randomUUID() + '@streak.test', username: role, password: 'Strong-test-password!' })
          .expect(201)
      ).body.user;
      app.db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
      clients.push({ client, user });
    }
    const [admin, player] = clients;
    const me = (await player.client.get('/api/social/me')).body.me;
    const url = '/api/admin/users/' + player.user.id + '/streak';
    const command = { count: 42, reason: 'Восстановление серии', commandId: randomUUID() };
    await request(app.app).post(url).send(command).expect(401);
    for (const c of clients.slice(1)) await c.client.post(url).send(command).expect(403);
    for (const count of [-1, 1.5, 36501, '4', null])
      await admin.client
        .post(url)
        .send({ ...command, count })
        .expect(400);
    await admin.client.post('/api/admin/users/missing/streak').send(command).expect(404);
    const beforeActivity = app.db.prepare('SELECT * FROM rr_daily WHERE user_id=?').all(player.user.id);
    const result = (await admin.client.post(url).send(command).expect(200)).body;
    expect(result).toMatchObject({ before: 0, after: 42, day: '2026-11-04' });
    expect((await admin.client.post(url).send(command).expect(200)).body).toEqual(result);
    await admin.client
      .post(url)
      .send({ ...command, count: 43 })
      .expect(409);
    expect(app.db.prepare('SELECT * FROM rr_daily WHERE user_id=?').all(player.user.id)).toEqual(
      beforeActivity,
    );
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(42);
    expect((await admin.client.get('/api/social/profile/' + me.publicId)).body.streak).toBe(42);
    expect(
      (await admin.client.get('/api/admin/users')).body.find((u: any) => u.id === player.user.id).streak,
    ).toBe(42);
    const audit = (await admin.client.get('/api/admin/audit')).body.filter(
      (a: any) => a.action === 'user.streak',
    );
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].streakDetails)).toMatchObject({
      before: 0,
      after: 42,
      reason: command.reason,
    });
    now += 86400000;
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(42);
    app.db.prepare('INSERT INTO rr_daily VALUES(?,?,?)').run(player.user.id, '2026-11-05', 3);
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(43);
    now += 2 * 86400000;
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(0);
    app.db.prepare('INSERT INTO rr_daily VALUES(?,?,?)').run(player.user.id, '2026-11-07', 2);
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(1);
    const reset = { count: 0, commandId: randomUUID() };
    await admin.client.post(url).send(reset).expect(200);
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(0);
    await admin.client.post(url).send(command).expect(200); // old receipt must not restore old value
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(0);
    now += 86400000;
    app.db.prepare('INSERT INTO rr_daily VALUES(?,?,?)').run(player.user.id, '2026-11-08', 1);
    expect((await player.client.get('/api/social/me')).body.me.streak).toBe(1);
    expect((await player.client.get('/api/auth/me')).body.user.xp).toBe(0);
  } finally {
    app.close();
  }
});

it('graphs use the same series calculation across month and Yerevan day boundaries', () => {
  const activity = [{ day: '2026-10-30' }, { day: '2026-10-31' }, { day: '2026-11-01' }];
  const adjustment = { day: '2026-10-31', count: 10 };
  expect(streakAt(activity, '2026-10-30', adjustment)).toBe(1);
  expect(streakAt(activity, '2026-10-31', adjustment)).toBe(10);
  expect(streakAt(activity, '2026-11-01', adjustment)).toBe(11);
  expect(streakAt(activity, '2026-11-02', adjustment)).toBe(11);
  expect(streakAt(activity, '2026-11-03', adjustment)).toBe(0);
});
