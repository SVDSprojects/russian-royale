import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';

it('waiting invitations cover the other seven modules without exposing private game state', async () => {
  let now = Date.now();
  const instance = createApp({ dbPath: ':memory:', testMode: true, now: () => now });
  try {
    const host = request.agent(instance.app),
      guest = request.agent(instance.app);
    for (const [i, c] of [host, guest].entries()) {
      await c
        .post('/api/auth/register')
        .send({ username: 'Игрок ' + i, email: `allwaiting${i}@test.ru`, password: 'Strong-test-password!' })
        .expect(201);
      await c.get('/api/servers').expect(200);
    }
    const modules = ['alias', 'whoami', 'impostor', 'mafia', 'bunker', 'broken-text', 'durak'];
    for (const game of modules) {
      const created = (
        await host
          .post(`/api/games/${game}/rooms`)
          .send({
            serverId: 'public-' + game,
            name: 'Ждём в ' + game,
            commandId: randomUUID(),
            expectedVersion: 0,
            settings: game === 'durak' ? { maxPlayers: 6, educational: false, ruleIds: [] } : {},
          })
          .expect((r) => expect([200, 201]).toContain(r.status))
      ).body;
      const roomId = created.roomId || created.view.roomId;
      expect(roomId).toBeTruthy();
      await host.get(`/api/games/${game}/rooms/${roomId}/view`).expect(200);
    }
    const feed = (await guest.get('/api/waiting-games').expect(200)).body.rooms;
    expect(feed.map((r: any) => r.game).sort()).toEqual(modules.sort());
    expect(feed.every((r: any) => r.waiting === 1 && !r.joined && !('state' in r) && !('view' in r))).toBe(
      true,
    );
    expect((await host.get('/api/waiting-games')).body.rooms).toHaveLength(0);
    now += 45001;
    expect((await guest.get('/api/waiting-games')).body.rooms).toHaveLength(0);
  } finally {
    instance.close();
  }
});

it('waiting rooms include all three games, respect membership, occupancy, phases and presence', async () => {
  let time = Date.now();
  const app = createApp({ dbPath: ':memory:', testMode: true, now: () => time });
  try {
    const [host, member, outsider] = [0, 1, 2].map(() => request.agent(app.app));
    for (const [i, agent] of [host, member, outsider].entries())
      await agent
        .post('/api/auth/register')
        .send({ username: `Игрок ${i}`, email: `waiting${i}@test.ru`, password: 'Strong-test-password!' })
        .expect(201);
    const server = { id: 'public-spy' };
    await host.get('/api/servers').expect(200);
    await member.get('/api/servers').expect(200);
    const spy = (await host.post(`/api/servers/${server.id}/rooms`).send({ name: 'Ждём друзей' }).expect(200))
      .body;
    for (const game of ['jeopardy', 'roulette'])
      await host
        .post(`/api/games/${game}/rooms`)
        .send({
          serverId: 'public-' + game,
          name: 'Новая партия',
          commandId: randomUUID(),
          expectedVersion: 0,
          settings:
            game === 'jeopardy'
              ? { contentId: 'demo', teamCount: 2 }
              : { contentId: 'demo', mode: 'points', durations: [30000, 25000, 20000] },
        })
        .expect(200);
    await request(app.app).get('/api/waiting-games').expect(401);
    expect((await outsider.get('/api/waiting-games')).body.rooms).toHaveLength(3);
    expect((await host.get('/api/waiting-games')).body.rooms).toEqual([]);
    const rooms = (await member.get('/api/waiting-games').expect(200)).body.rooms;
    expect(rooms.map((r: any) => r.game).sort()).toEqual(['jeopardy', 'roulette', 'spy']);
    expect(rooms.every((r: any) => r.waiting === 1 && !!r.serverName && !r.joined && !('state' in r))).toBe(
      true,
    );
    app.db.prepare("UPDATE rr_jeopardy_rooms SET state=json_set(state,'$.phase','board')").run();
    expect((await member.get('/api/waiting-games')).body.rooms).toHaveLength(2);
    await outsider.post(`/api/rooms/${spy.id}/join`).send({}).expect(200);
    await member.post(`/api/rooms/${spy.id}/join`).send({}).expect(200);
    app.db.prepare('UPDATE rooms SET max_players=3 WHERE id=?').run(spy.id);
    expect((await member.get('/api/waiting-games')).body.rooms.map((r: any) => r.game)).toEqual(['roulette']);
    time += 16000;
    expect((await member.get('/api/waiting-games')).body.rooms).toEqual([]);
    app.db.prepare('UPDATE rooms SET max_players=30 WHERE id=?').run(spy.id);
    expect((await member.get('/api/waiting-games')).body.rooms.map((r: any) => r.game)).toEqual(['spy']);
    time += 30000;
    expect((await member.get('/api/waiting-games')).body.rooms).toEqual([]);
  } finally {
    app.close();
  }
});
