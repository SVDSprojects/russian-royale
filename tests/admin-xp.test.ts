import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';

it('only admins adjust XP, with atomic changes, receipts and an audit trail', async () => {
  const a = createApp({ dbPath: ':memory:', testMode: true });
  async function register(role: string) {
    const client = request.agent(a.app);
    const user = (
      await client
        .post('/api/auth/register')
        .send({ email: randomUUID() + '@xp.test', username: role, password: 'Strong-test-password!' })
        .expect(201)
    ).body.user;
    a.db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
    return { client, user };
  }
  try {
    const admin = await register('admin'),
      player = await register('player');
    const url = '/api/admin/users/' + player.user.id + '/xp';
    const command = { delta: 1000, commandId: randomUUID(), reason: 'Награда за турнир' };
    await request(a.app).post(url).send(command).expect(401);
    for (const role of ['player', 'moderator', 'editor']) {
      a.db.prepare('UPDATE users SET role=? WHERE id=?').run(role, player.user.id);
      await player.client.post(url).send(command).expect(403);
    }
    a.db.prepare("UPDATE users SET role='player' WHERE id=?").run(player.user.id);
    const result = (await admin.client.post(url).send(command).expect(200)).body;
    expect(result).toMatchObject({ before: 0, after: 1000, delta: 1000 });
    expect((await admin.client.post(url).send(command).expect(200)).body).toEqual(result);
    await admin.client
      .post(url)
      .send({ ...command, delta: 5 })
      .expect(409);
    for (const delta of [0, 1.5, '100', 1000001, -1000001])
      await admin.client.post(url).send({ delta, commandId: randomUUID() }).expect(400);
    await admin.client.post(url).send({ delta: -1001, commandId: randomUUID() }).expect(409);
    await admin.client
      .post('/api/admin/users/missing/xp')
      .send({ delta: 1, commandId: randomUUID() })
      .expect(404);
    const changes = await Promise.all(
      [2, 3].map((delta) => admin.client.post(url).send({ delta, commandId: randomUUID() })),
    );
    expect(changes.map((r) => r.status)).toEqual([200, 200]);
    expect((await player.client.get('/api/auth/me')).body.user.xp).toBe(1005);
    const audits = (await admin.client.get('/api/admin/audit')).body.filter(
      (e: any) => e.action === 'user.xp',
    );
    expect(audits).toHaveLength(3);
    expect(JSON.parse(audits.find((e: any) => JSON.parse(e.xpDetails).reason).xpDetails)).toMatchObject({
      before: 0,
      after: 1000,
      delta: 1000,
      reason: 'Награда за турнир',
    });
    await admin.client
      .post('/api/admin/users/' + admin.user.id + '/xp')
      .send({ delta: 20, commandId: randomUUID() })
      .expect(200);
    // Spending and existing gifts are preserved when lifetime XP is corrected.
    await player.client
      .post('/api/collection/purchase')
      .send({ product: 'standard', commandId: randomUUID() })
      .expect(200);
    const debit = { delta: -605, commandId: randomUUID() };
    await admin.client.post(url).send(debit).expect(200);
    await admin.client.post(url).send(debit).expect(200);
    let shop = (await player.client.get('/api/collection')).body;
    expect(shop.balance).toEqual({ earned: 400, spent: 500, available: 0 });
    expect(shop.inventory).toHaveLength(1);
    await admin.client.post(url).send({ delta: 200, commandId: randomUUID() }).expect(200);
    shop = (await player.client.get('/api/collection')).body;
    expect(shop.balance).toEqual({ earned: 600, spent: 500, available: 100 });
  } finally {
    a.close();
  }
});
