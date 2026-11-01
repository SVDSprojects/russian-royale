import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
it('roulette accepts simultaneous answers once and rejects late or cross-round answers', async () => {
  let now = Date.now();
  const a = createApp({ dbPath: ':memory:', testMode: true, now: () => now });
  try {
    const users = [request.agent(a.app), request.agent(a.app)];
    for (const [i, c] of users.entries())
      await c
        .post('/api/auth/register')
        .send({ username: 'Игрок ' + i, email: `speed${i}@test.ru`, password: 'Strong-test-password!' })
        .expect(201);
    await users[0].get('/api/servers');
    await users[1].get('/api/servers');
    const base = '/api/games/roulette/rooms';
    const command = (v: number, extra = {}) => ({ commandId: randomUUID(), expectedVersion: v, ...extra });
    let d = (
      await users[0]
        .post(base)
        .send(
          command(0, {
            serverId: 'public-roulette',
            name: 'Проверка скорости',
            settings: { contentId: 'demo', mode: 'speed', durations: [100000, 100000, 100000] },
          }),
        )
        .expect(200)
    ).body;
    const room = base + '/' + d.roomId;
    d = (
      await users[1]
        .post(room + '/join')
        .send(command(d.version))
        .expect(200)
    ).body;
    for (const c of users)
      d = (
        await c
          .post(room + '/ready')
          .send(command(d.version, { ready: true }))
          .expect(200)
      ).body;
    d = (
      await users[0]
        .post(room + '/start')
        .send(command(d.version))
        .expect(200)
    ).body;
    now = d.view.deadline;
    d = (await users[0].get(room + '/view').expect(200)).body;
    expect(d.view.phase).toBe('question');
    expect(d.view.deadline - d.view.phaseStartedAt).toBe(100000);
    const current = a.db
      .prepare('SELECT state FROM rr_roulette_rooms WHERE id=?')
      .get(d.roomId || room.split('/').pop());
    const state = JSON.parse(current.state);
    const q = state.contentSnapshot.questions.find((q: any) => q.id === state.currentId);
    const extra = {
      expectedSessionId: d.view.sessionId,
      expectedRound: d.view.round,
      action: { type: 'answer', text: q.acceptedAnswers[0] },
    };
    const first = command(d.version, extra);
    await users[0]
      .post(room + '/actions')
      .send(first)
      .expect(200);
    await users[1]
      .post(room + '/actions')
      .send(command(d.version, extra))
      .expect(200);
    await users[0]
      .post(room + '/actions')
      .send(first)
      .expect(200);
    const raw = JSON.parse(
      a.db.prepare('SELECT state FROM rr_roulette_rooms WHERE id=?').get(room.split('/').pop()).state,
    );
    expect(raw.answers).toHaveLength(2);
    expect(raw.players.every((p: any) => p.score === 100)).toBe(true);
    expect((await users[0].get('/api/social/me')).body.me.streak).toBe(1);
  } finally {
    a.close();
  }
});
it('spy may make one early guess and equivalent roots end the real party', async () => {
  const a = createApp({ dbPath: ':memory:', testMode: true });
  try {
    const users = [request.agent(a.app), request.agent(a.app), request.agent(a.app)],
      ids = [];
    for (const [i, c] of users.entries()) {
      const r = await c
        .post('/api/auth/register')
        .send({ username: 'Шпион ' + i, email: `spy-update${i}@test.ru`, password: 'Strong-test-password!' })
        .expect(201);
      ids.push(r.body.user.id);
      await c.get('/api/servers');
    }
    a.db.prepare("UPDATE rules SET title='Корни раст/ращ/рос'").run();
    const room = (
      await users[0].post('/api/servers/public-spy/rooms').send({ name: 'Досрочный ответ' }).expect(200)
    ).body;
    for (const c of users.slice(1))
      await c
        .post('/api/rooms/' + room.id + '/join')
        .send({})
        .expect(200);
    for (const c of users)
      await c
        .post('/api/rooms/' + room.id + '/ready')
        .send({ ready: true })
        .expect(200);
    await users[0]
      .post('/api/rooms/' + room.id + '/start')
      .send({})
      .expect(200);
    const session = a.db.prepare('SELECT * FROM game_sessions WHERE room_id=?').get(room.id),
      spy = ids.indexOf(session.spy_id);
    const response = await users[spy]
      .post('/api/rooms/' + room.id + '/guess')
      .send({ answer: 'раст рост' })
      .expect(200);
    expect(response.body.phase).toBe('finished');
    expect(response.body.result.winner).toBe('spy');
    await users[spy]
      .post('/api/rooms/' + room.id + '/guess')
      .send({ answer: 'раст рост' })
      .expect(409);
  } finally {
    a.close();
  }
});
