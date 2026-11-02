import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { challengeBanks } from '../server/challenges';
async function player(
  app: ReturnType<typeof createApp>,
  name = 'Игрок',
  email = randomUUID() + '@example.test',
) {
  const client = request.agent(app.app);
  const user = (
    await client
      .post('/api/auth/register')
      .send({ email, username: name, password: 'Secure-test-password!' })
      .expect(201)
  ).body.user;
  const profile = (await client.get('/api/social/me').expect(200)).body.me;
  return { client, user, profile };
}
describe('server-owned XP wallet and collections', () => {
  it('keeps lifetime XP, handles duplicate requests and refuses forged prices or insufficient funds', async () => {
    const app = createApp({ dbPath: ':memory:', testMode: true });
    try {
      const { client, user } = await player(app);
      await request(app.app).get('/api/collection').expect(401);
      await client
        .post('/api/collection/purchase')
        .send({ product: 'standard', commandId: randomUUID(), price: 0 })
        .expect(409);
      app.db.prepare('UPDATE users SET xp=1000 WHERE id=?').run(user.id);
      const commandId = randomUUID();
      const first = (
        await client
          .post('/api/collection/purchase')
          .send({ product: 'standard', commandId, price: 0 })
          .expect(200)
      ).body;
      const replay = (
        await client.post('/api/collection/purchase').send({ product: 'standard', commandId }).expect(200)
      ).body;
      expect(replay.reward).toEqual(first.reward);
      expect(first.price).toBe(500);
      expect(replay.balance).toEqual({ earned: 1000, spent: 500, available: 500 });
      await client.post('/api/collection/purchase').send({ product: 'identity', commandId }).expect(409);
      const simultaneous = await Promise.all(
        [0, 1].map(() =>
          client.post('/api/collection/purchase').send({ product: 'standard', commandId: randomUUID() }),
        ),
      );
      expect(simultaneous.map((r) => r.status).sort()).toEqual([200, 409]);
      const shop = (await client.get('/api/collection')).body;
      expect(shop.inventory).toHaveLength(2);
      expect(shop.balance.available).toBe(0);
      expect((await client.get('/api/auth/me')).body.user.xp).toBe(1000);
    } finally {
      app.close();
    }
  });
  it('reserves unique IDs, blocks theft and preserves fixed founder/Hayk IDs', async () => {
    const app = createApp({ dbPath: ':memory:', testMode: true });
    try {
      const a = await player(app),
        b = await player(app, 'Hayk'),
        founder = await player(app, 'Старый ник', 'vbarsegan363@gmail.com');
      expect(b.profile.publicId).toBe('000007');
      expect(founder.profile.username).toBe('CEO"SDVS"');
      expect(founder.profile.publicId).toBe('000001');
      app.db.prepare('UPDATE users SET xp=5000').run();
      const reward = (
        await a.client
          .post('/api/collection/purchase')
          .send({ product: 'identity', commandId: randomUUID() })
          .expect(200)
      ).body.reward;
      expect(Number(reward.reward)).toBeGreaterThanOrEqual(10000);
      expect(Number(reward.reward)).toBeLessThanOrEqual(111110);
      await b.client
        .post('/api/collection/ids/' + reward.reward + '/apply')
        .send({})
        .expect(409);
      await founder.client
        .post('/api/collection/ids/' + reward.reward + '/apply')
        .send({})
        .expect(409);
      await a.client
        .post('/api/collection/ids/' + reward.reward + '/apply')
        .send({})
        .expect(200);
      expect((await a.client.get('/api/social/me')).body.me.publicId).toBe(reward.reward);
      const fake = await player(app, 'CEO"SDVS"');
      const identities = (await fake.client.get('/api/identities')).body;
      expect(identities.filter((i: any) => i.verified).map((i: any) => i.id)).toEqual([founder.user.id]);
    } finally {
      app.close();
    }
  });
  it('enforces ownership, friendship and premium expiry for public decorations', async () => {
    let now = Date.now();
    const app = createApp({ dbPath: ':memory:', testMode: true, now: () => now });
    try {
      const a = await player(app),
        b = await player(app);
      app.db.prepare('UPDATE users SET xp=100000 WHERE id=?').run(a.user.id);
      const item = (
        await a.client.post('/api/collection/purchase').send({ product: 'standard', commandId: randomUUID() })
      ).body.reward;
      await b.client
        .patch('/api/collection/appearance')
        .send({ emoji: '', featured: [item.id] })
        .expect(400);
      await a.client
        .patch('/api/collection/appearance')
        .send({ emoji: '🔥', featured: [item.id] })
        .expect(400);
      await a.client
        .post('/api/collection/purchase')
        .send({ product: 'premium', commandId: randomUUID() })
        .expect(200);
      await a.client
        .patch('/api/collection/appearance')
        .send({ emoji: '🔥', featured: [item.id] })
        .expect(200);
      expect((await b.client.get('/api/collection/profile/' + a.profile.publicId)).body.emoji).toBe('🔥');
      await a.client
        .post('/api/collection/gifts/' + item.id + '/send')
        .send({ targetId: b.profile.publicId })
        .expect(403);
      await a.client.post('/api/social/friends/' + b.profile.publicId).send({});
      await b.client.post('/api/social/friends/' + a.profile.publicId).send({});
      await a.client
        .post('/api/collection/gifts/' + item.id + '/send')
        .send({ targetId: b.profile.publicId })
        .expect(200);
      await a.client
        .post('/api/collection/gifts/' + item.id + '/send')
        .send({ targetId: b.profile.publicId })
        .expect(409);
      expect((await a.client.get('/api/collection')).body.appearance.featured).toEqual([]);
      expect((await b.client.get('/api/collection')).body.inventory[0].id).toBe(item.id);
      now += 31 * 86400000;
      app.db.prepare('UPDATE sessions SET expires_at=?').run(now + 86400000);
      const expired = (await a.client.get('/api/collection')).body.appearance;
      expect(expired.premium).toBe(false);
      expect(expired.emoji).toBe('');
    } finally {
      app.close();
    }
  });
});
describe('academic dictionary import and privacy', () => {
  it('starts empty, requires an editor preview, detects changes and keeps favorites private', async () => {
    const app = createApp({ dbPath: ':memory:', testMode: true });
    try {
      const a = await player(app),
        b = await player(app);
      expect((await a.client.get('/api/dictionary')).body.count).toBe(0);
      const dictionary = {
        source: 'Тестовый источник',
        version: '1',
        entries: [{ word: 'Слово', meaning: 'Значение.', category: 'Лексика', examples: ['Это слово.'] }],
      };
      await a.client.post('/api/admin/dictionary/import').send({ dictionary, preview: true }).expect(403);
      app.db.prepare("UPDATE users SET role='editor' WHERE id=?").run(a.user.id);
      await a.client.post('/api/admin/dictionary/import').send({ dictionary }).expect(409);
      const preview = (
        await a.client.post('/api/admin/dictionary/import').send({ dictionary, preview: true }).expect(200)
      ).body;
      expect((await a.client.get('/api/dictionary')).body.count).toBe(0);
      await a.client
        .post('/api/admin/dictionary/import')
        .send({ dictionary: { ...dictionary, version: '2' }, token: preview.token })
        .expect(409);
      await a.client
        .post('/api/admin/dictionary/import')
        .send({ dictionary, token: preview.token })
        .expect(200);
      await a.client
        .post('/api/admin/dictionary/import')
        .send({ dictionary, token: preview.token })
        .expect(409);
      const data = (await a.client.get('/api/dictionary?q=СЛО')).body;
      expect(data.total).toBe(1);
      await a.client
        .post('/api/dictionary/' + data.entries[0].id + '/favorite')
        .send({ favorite: true })
        .expect(200);
      expect((await a.client.get('/api/dictionary/practice')).body).toHaveLength(1);
      expect((await b.client.get('/api/dictionary?favorites=true')).body.total).toBe(0);
      const duplicate = {
        ...dictionary,
        entries: [...dictionary.entries, { ...dictionary.entries[0], word: 'слово' }],
      };
      await a.client
        .post('/api/admin/dictionary/import')
        .send({ dictionary: duplicate, preview: true })
        .expect(400);
      expect((await a.client.get('/api/dictionary')).body.count).toBe(1);
    } finally {
      app.close();
    }
  });
});
describe('new learning games', () => {
  it.each(['editor', 'stress', 'punctuation'])(
    '%s hides answers, checks reasoning and awards each question only once',
    async (mode) => {
      const app = createApp({ dbPath: ':memory:', testMode: true });
      try {
        const { client } = await player(app);
        const bank = challengeBanks[mode];
        const view = (await client.get('/api/challenges/' + mode).expect(200)).body;
        expect(
          view.questions.every((q: any) => !('answer' in q) && !('explanation' in q) && !('reason' in q)),
        ).toBe(true);
        let sum = 0;
        for (const q of bank) {
          const url = '/api/challenges/' + mode + '/' + q.id + '/answer';
          if (q.reasons) await client.post(url).send({ answer: q.answer }).expect(400);
          const result = (await client.post(url).send({ answer: q.answer, reason: q.reason }).expect(200))
            .body;
          expect(result.correct).toBe(true);
          sum += result.xpAwarded;
          expect((await client.post(url).send({ answer: q.answer, reason: q.reason })).body.xpAwarded).toBe(
            0,
          );
        }
        expect(sum).toBe(bank.length * 5);
        expect((await client.get('/api/collection')).body.balance.earned).toBe(sum);
      } finally {
        app.close();
      }
    },
  );
});
