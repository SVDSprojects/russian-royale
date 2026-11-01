import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { matchesSpyTopic } from '../server/game';
it('profiles, public IDs, friend acceptance, privacy and daily series', async () => {
  let now = Date.now();
  const a = createApp({ dbPath: ':memory:', testMode: true, now: () => now });
  try {
    const users = [request.agent(a.app), request.agent(a.app), request.agent(a.app)];
    for (const [i, c] of users.entries())
      await c
        .post('/api/auth/register')
        .send({
          username: 'Друг ' + i,
          email: i === 0 ? 'vbarsegan363@gmail.com' : `social${i}@test.ru`,
          password: 'Strong-test-password!',
        })
        .expect(201);
    const ps = [];
    for (const c of users) ps.push((await c.get('/api/social/me').expect(200)).body.me);
    expect(ps[0].publicId).toBe('000001');
    expect(Number(ps[1].publicId)).toBeGreaterThanOrEqual(111111);
    expect(ps[1].publicId).not.toBe(ps[2].publicId);
    await users[0]
      .post('/api/social/friends/' + ps[1].publicId)
      .send({})
      .expect(200);
    expect((await users[1].get('/api/social/me')).body.friends[0].incoming).toBe(true);
    await users[1]
      .post('/api/social/friends/' + ps[0].publicId)
      .send({})
      .expect(200);
    expect((await users[0].get('/api/social/me')).body.friends[0].status).toBe('accepted');
    await users[2].get('/api/social/friends/' + ps[0].publicId + '/games').expect(403);
    await users[0].patch('/api/social/me').send({ username: 'Новый ник', bio: 'Люблю играть' }).expect(200);
    const view = (await users[1].get('/api/social/profile/000001')).body;
    expect(view.username).toBe('Новый ник');
    expect(view.email).toBeUndefined();
    await users[0]
      .patch('/api/social/me')
      .send({ username: 'Ник', bio: '', photo: 'data:image/svg+xml;base64,abc' })
      .expect(400);
    const stamp = (t: number) => new Date(t + 14400000).toISOString().slice(0, 10);
    for (const p of ps.slice(0, 2))
      for (const off of [0, 1])
        a.db.prepare('INSERT INTO rr_daily VALUES(?,?,1)').run(p.id, stamp(now - off * 86400000));
    expect((await users[0].get('/api/social/me')).body.friends[0].pairStreak).toBe(2);
    await users[0].get('/api/servers');
    await users[1].get('/api/servers');
    const room = (await users[0].post('/api/servers/public-spy/rooms').send({ name: 'Вместе' }).expect(200))
      .body;
    await users[0].get('/api/rooms/' + room.id).expect(200);
    expect((await users[1].get('/api/social/friends/000001/games')).body[0].roomId).toBe(room.id);
    now += 46000;
    expect((await users[1].get('/api/social/friends/000001/games')).body).toHaveLength(0);
    now += 86400000 * 2;
    expect((await users[0].get('/api/social/me')).body.me.streak).toBe(0);
    await users[0].delete('/api/social/friends/' + ps[1].publicId).expect(200);
    expect((await users[1].get('/api/social/me')).body.friends).toHaveLength(0);
  } finally {
    a.close();
  }
});
it('spy accepts root order and rejects unrelated or incomplete roots', () => {
  expect(matchesSpyTopic('раст, ращ, рос', 'Чередующиеся корни РАСТ — РАЩ — РОС')).toBe(true);
  expect(matchesSpyTopic('рос ращ раст', 'Корни раст/ращ/рос')).toBe(true);
  expect(matchesSpyTopic('раст', 'Корни раст/ращ/рос')).toBe(false);
  expect(matchesSpyTopic('корни раст рост', 'Корни раст/ращ/рос')).toBe(true);
  expect(matchesSpyTopic('гар гор', 'Корни раст/ращ/рос')).toBe(false);
});
