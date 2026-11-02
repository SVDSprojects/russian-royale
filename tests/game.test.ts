import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { majorityTarget, normalizeGuess } from '../server/game';

describe('Authoritative multiplayer / stages 1–3 integration', () => {
  let instance: ReturnType<typeof createApp>,
    clock: number,
    players: any[],
    users: any[],
    room: any,
    server: any,
    invite: any;
  beforeEach(async () => {
    clock = Date.now();
    instance = createApp({ dbPath: ':memory:', testMode: true, now: () => clock });
    players = [];
    users = [];
    for (let i = 0; i < 4; i++) {
      const agent = request.agent(instance.app);
      const res = await agent
        .post('/api/auth/register')
        .send({ email: `player${i}@royale.test`, password: 'Secure-Game-2026!', username: `Игрок ${i + 1}` })
        .expect(201);
      players.push(agent);
      users.push(res.body.user);
    }
    for (const player of players) await player.get('/api/servers').expect(200);
    server = {id:'public-spy'};
    room = (
      await players[0]
        .post(`/api/servers/${server.id}/rooms`)
        .send({
          name: 'Лингвистический шпион',
          maxPlayers: 3,
          discussionSeconds: 30,
          voteSeconds: 15,
          guessSeconds: 15,
        })
        .expect(200)
    ).body;
    for (const player of players.slice(1, 3))
      await player.post(`/api/rooms/${room.id}/join`).send({}).expect(200);
  });
  afterEach(() => instance.close());
  async function start() {
    for (const p of players.slice(0, 3))
      await p.post(`/api/rooms/${room.id}/ready`).send({ ready: true }).expect(200);
    return (await players[0].post(`/api/rooms/${room.id}/start`).send({}).expect(200)).body;
  }
  async function views() {
    return Promise.all(
      players.slice(0, 3).map(async (p) => (await p.get(`/api/rooms/${room.id}`).expect(200)).body),
    );
  }
  async function voting() {
    await players[0].post(`/api/rooms/${room.id}/advance`).send({}).expect(200);
  }
  async function voteAll(targetId: string) {
    for (const p of players.slice(0, 3))
      await p.post(`/api/rooms/${room.id}/vote`).send({ targetId }).expect(200);
  }
  it('keeps public servers open while preserving room membership and capacity', async () => {
    await players[3].get(`/api/servers/${server.id}`).expect(200);
    const observer = (await players[3].get(`/api/rooms/${room.id}`).expect(200)).body;
    expect(observer.me.role).toBeUndefined();
    expect(observer.me.topic).toBeUndefined();
    await players[0].post(`/api/servers/${server.id}/invites`).send({}).expect(403);
    await players[3].post(`/api/rooms/${room.id}/join`).send({}).expect(409);
    await request(instance.app).get(`/api/rooms/${room.id}`).expect(401);
    expect((await players[0].get('/api/servers')).body.find((s:any)=>s.id===server.id).memberCount).toBe(4);
  });
  it('rejects premature starts, non-host starts and duplicate starts', async () => {
    await players[0].post(`/api/rooms/${room.id}/start`).send({}).expect(400);
    await players[1].post(`/api/rooms/${room.id}/start`).send({}).expect(403);
    await start();
    await players[0].post(`/api/rooms/${room.id}/start`).send({}).expect(409);
    expect(instance.db.prepare('SELECT count(*) n FROM game_sessions').get().n).toBe(1);
  });
  it('assigns exactly one spy and never sends topic/other roles to that player', async () => {
    await start();
    const states = await views(),
      spies = states.filter((s) => s.me.role === 'spy');
    expect(spies).toHaveLength(1);
    const spy = spies[0];
    expect(spy.me.category).toBe('Орфография');
    expect(spy.me.topic).toBeUndefined();
    expect(spy.result).toBeNull();
    const title = instance.db.prepare('SELECT title FROM rules LIMIT 1').get().title;
    expect(JSON.stringify(spy)).not.toContain(title);
    expect(JSON.stringify(spy)).not.toContain('spy_id');
    expect(JSON.stringify(spy)).not.toContain('topic_snapshot');
    expect(states.filter((s) => s.me.role === 'citizen').every((s) => s.me.topic === title)).toBe(true);
    expect(spy.players.every((p: any) => !('role' in p))).toBe(true);
  });
  it('records a vote once, rejects outsiders and forged targets', async () => {
    await start();
    await voting();
    await players[0].post(`/api/rooms/${room.id}/vote`).send({ targetId: users[3].id }).expect(400);
    await players[0].post(`/api/rooms/${room.id}/vote`).send({ targetId: users[1].id }).expect(200);
    await players[0].post(`/api/rooms/${room.id}/vote`).send({ targetId: users[2].id }).expect(409);
    await players[3].post(`/api/rooms/${room.id}/vote`).send({ targetId: users[1].id }).expect(403);
    expect(instance.db.prepare('SELECT count(*) n FROM game_votes').get().n).toBe(1);
  });
  it('lets the spy win when majority selects an innocent and awards XP exactly once', async () => {
    await start();
    const states = await views(),
      innocent = states.findIndex((s) => s.me.role === 'citizen');
    await voting();
    await voteAll(users[innocent].id);
    const result = (await views())[0];
    expect(result.phase).toBe('finished');
    expect(result.result.winner).toBe('spy');
    for (let i = 0; i < 3; i++) {
      expect(instance.db.prepare('SELECT xp FROM users WHERE id=?').get(users[i].id).xp).toBe(
        states[i].me.role === 'spy' ? 30 : 10,
      );
    }
    clock += 100000;
    instance.tick();
    await views();
    await players[0].post(`/api/rooms/${room.id}/vote`).send({ targetId: users[innocent].id }).expect(409);
    expect(instance.db.prepare('SELECT count(*) n FROM game_results').get().n).toBe(3);
    expect(instance.db.prepare('SELECT SUM(xp) n FROM game_results').get().n).toBe(50);
  });
  it.each([true, false])(
    'resolves a caught spy guess (correct=%s) and rejects another player',
    async (correct) => {
      await start();
      const states = await views(),
        spy = states.findIndex((s) => s.me.role === 'spy'),
        citizen = states.findIndex((s) => s.me.role === 'citizen');
      await voting();
      await voteAll(users[spy].id);
      expect((await views())[spy].phase).toBe('guess');
      await players[citizen].post(`/api/rooms/${room.id}/guess`).send({ answer: 'запрещено' }).expect(403);
      const answer = correct ? states[citizen].me.topic.toUpperCase() : 'Другая тема';
      const result = await players[spy].post(`/api/rooms/${room.id}/guess`).send({ answer }).expect(200);
      expect(result.body.result.winner).toBe(correct ? 'spy' : 'citizens');
      await players[spy].post(`/api/rooms/${room.id}/guess`).send({ answer }).expect(409);
    },
  );
  it('handles tie, abstentions and expired voting on server clock', async () => {
    await start();
    clock += 30001;
    instance.tick();
    expect((await views())[0].phase).toBe('voting');
    for (let i = 0; i < 3; i++)
      await players[i].post(`/api/rooms/${room.id}/vote`).send({ targetId: users[i].id }).expect(200);
    expect((await views())[0].result.winner).toBe('spy');
    await players[0].post(`/api/rooms/${room.id}/next`).send({}).expect(200);
    await start();
    clock += 46000;
    instance.tick();
    expect((await views())[0].result.winner).toBe('spy');
  });
  it('awards citizens victory when caught spy runs out of time', async () => {
    await start();
    const states = await views(),
      spy = states.findIndex((s) => s.me.role === 'spy');
    await voting();
    await voteAll(users[spy].id);
    clock += 15001;
    instance.tick();
    expect((await views())[0].result.winner).toBe('citizens');
  });
  it('restores own role on reconnect and transfers host on explicit departure', async () => {
    await start();
    const before = await views();
    await players[0].post(`/api/rooms/${room.id}/leave`).send({}).expect(200);
    const next = (await players[1].get(`/api/rooms/${room.id}`)).body;
    expect(next.hostId).not.toBe(users[0].id);
    const reconnected = (await players[0].post(`/api/rooms/${room.id}/join`).send({}).expect(200)).body;
    expect(reconnected.me.role).toBe(before[0].me.role);
    expect(reconnected.me.topic).toBe(before[0].me.topic);
    expect(reconnected.me.category).toBe(before[0].me.category);
    expect(reconnected.sessionId).toBe(before[0].sessionId);
  });
  it('transfers host after grace when host loses internet', async () => {
    clock += 46000;
    await players[1].get(`/api/rooms/${room.id}`).expect(200);
    const next = (await players[1].get(`/api/rooms/${room.id}`)).body;
    expect(next.hostId).toBe(users[1].id);
  });
  it('snapshot survives rule deletion; next round requires newly published content', async () => {
    instance.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(users[0].id);
    await start();
    const states = await views(),
      innocent = states.findIndex((s) => s.me.role === 'citizen'),
      original = states[innocent].me.topic;
    const rule = instance.db.prepare('SELECT * FROM rules LIMIT 1').get();
    await players[0].delete(`/api/admin/rules/${rule.id}`).expect(200);
    expect((await views())[innocent].me.topic).toBe(original);
    await voting();
    await voteAll(users[innocent].id);
    expect((await views())[0].result.topic).toBe(original);
    await players[0].post(`/api/rooms/${room.id}/next`).send({}).expect(200);
    for (const p of players.slice(0, 3))
      await p.post(`/api/rooms/${room.id}/ready`).send({ ready: true }).expect(200);
    await players[0].post(`/api/rooms/${room.id}/start`).send({}).expect(400);
    await players[0]
      .post('/api/admin/rules')
      .send({
        title: 'Новое правило редактора',
        categoryId: rule.category_id,
        explanation: 'Новое объяснение',
        games: ['spy'],
        published: true,
      })
      .expect(201);
    await players[0].post(`/api/rooms/${room.id}/start`).send({}).expect(200);
    expect(
      (await views()).filter((s) => s.me.topic).every((s) => s.me.topic === 'Новое правило редактора'),
    ).toBe(true);
    expect(instance.db.prepare('SELECT topic_title FROM game_results LIMIT 1').get().topic_title).toBe(
      original,
    );
  });
  it('sanitizes chat by storing text and disallows unauthorized history access', async () => {
    await players[1]
      .post(`/api/rooms/${room.id}/messages`)
      .send({ text: '<script>alert(1)</script>' })
      .expect(200);
    expect((await players[0].get(`/api/rooms/${room.id}/messages`)).body[0].text).toBe(
      '<script>alert(1)</script>',
    );
    await players[3].get(`/api/rooms/${room.id}/messages`).expect(403);
    await players[1].post(`/api/rooms/${room.id}/messages`).send({ text: 'ещё' }).expect(429);
  });
});

it('majority requires strictly more than half; guess ignores formatting but not words', () => {
  expect(majorityTarget([{ target_id: 'a' }, { target_id: 'a' }], 4)).toBeNull();
  expect(majorityTarget([{ target_id: 'a' }, { target_id: 'a' }, { target_id: 'a' }], 4)).toBe('a');
  expect(normalizeGuess('Суффиксы –ЕК– и –ИК–')).toBe(normalizeGuess('суффиксы -ек- и -ик-'));
});

it('persists session, role and elapsed deadlines across actual server restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'royale-restart-')),
    path = join(dir, 'db.sqlite');
  let clock = Date.now();
  let instance = createApp({ dbPath: path, testMode: true, now: () => clock });
  try {
    const agents = [],
      cookies: string[] = [];
    let room: any, server: any, invite: any;
    for (let i = 0; i < 3; i++) {
      const a = request.agent(instance.app),
        res = await a
          .post('/api/auth/register')
          .send({ email: `persist${i}@royale.test`, password: 'Secure-Game-2026!', username: `Игрок ${i}` })
          .expect(201);
      agents.push(a);
      cookies.push(String(res.headers['set-cookie'][0]).split(';')[0]);
    }
    for (const a of agents) await a.get('/api/servers').expect(200);
    server = { id: 'public-spy' };
    room = (
      await agents[0]
        .post(`/api/servers/${server.id}/rooms`)
        .send({ name: 'Тест', discussionSeconds: 30, voteSeconds: 15, guessSeconds: 15 })
    ).body;
    for (const a of agents) {
      await a.post(`/api/rooms/${room.id}/join`).send({});
      await a.post(`/api/rooms/${room.id}/ready`).send({ ready: true });
    }
    const before = (await agents[0].post(`/api/rooms/${room.id}/start`).send({}).expect(200)).body;
    instance.close();
    instance = createApp({ dbPath: path, testMode: true, now: () => clock });
    const after = (
      await request(instance.app).get(`/api/rooms/${room.id}`).set('Cookie', cookies[0]).expect(200)
    ).body;
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.me).toEqual(before.me);
    clock += 60000;
    instance.tick();
    const finished = (
      await request(instance.app).get(`/api/rooms/${room.id}`).set('Cookie', cookies[0]).expect(200)
    ).body;
    expect(finished.phase).toBe('finished');
    expect(finished.result.winner).toBe('spy');
    expect(instance.db.prepare('SELECT count(*) n FROM game_results').get().n).toBe(3);
  } finally {
    instance.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
