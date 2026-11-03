import { it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { defaultProfileStyle } from '../shared/profile-style';
it('persists profile colors and birthday, validates ownership and removes sent status gifts', async () => {
  let now = Date.UTC(2026, 10, 3);
  const app = createApp({ dbPath: ':memory:', testMode: true, now: () => now });
  const a = request.agent(app.app),
    b = request.agent(app.app);
  try {
    const users = [];
    for (const [i, c] of [a, b].entries())
      users.push(
        (
          await c
            .post('/api/auth/register')
            .send({
              email: randomUUID() + '@profile.test',
              username: 'Профиль ' + i,
              password: 'Strong-test-password!',
            })
            .expect(201)
        ).body.user,
      );
    const me = (await a.get('/api/social/me')).body.me,
      other = (await b.get('/api/social/me')).body.me;
    const items = Array.from({ length: 6 }, () => randomUUID());
    for (const [i, id] of items.entries())
      app.db
        .prepare('INSERT INTO rr_inventory VALUES(?,?,?,?,?,?)')
        .run(
          id,
          users[0].id,
          'gift',
          ['khabib-v01', 'islam-v02', 'topuria-v03', 'mcgregor-v04', 'omalley-v05', 'tsarukyan'][i],
          i + 1,
          now,
        );
    const style = {
      ...defaultProfileStyle,
      color: '#b46374',
      accent: '#783957',
      pattern: 'paws',
      intensity: 22,
      giftLayout: 'both',
      statusGiftId: items[0],
    };
    await a.patch('/api/collection/appearance').send({ emoji: '', featured: items, style }).expect(400);
    app.db
      .prepare('INSERT INTO rr_shop_profile(user_id,premium_until) VALUES(?,?)')
      .run(users[0].id, now + 86400000);
    await a.patch('/api/collection/appearance').send({ emoji: '', featured: items, style }).expect(200);
    const publicAppearance = (await b.get('/api/collection/profile/' + me.publicId)).body;
    expect(publicAppearance.style).toEqual(style);
    expect(publicAppearance.featured).toHaveLength(6);
    expect(publicAppearance.statusGift.id).toBe(items[0]);
    await b.patch('/api/collection/appearance').send({ emoji: '', featured: [], style }).expect(400);
    for (const bad of [
      { color: 'url(javascript:alert(1))' },
      { intensity: 99 },
      { pattern: 'anything' },
      { giftLayout: '<script>' },
      { statusGiftId: 'missing' },
    ])
      await a
        .patch('/api/collection/appearance')
        .send({ emoji: '', featured: items, style: { ...style, ...bad } })
        .expect(400);
    for (const birthday of ['2026-02-30', '2030-01-01', '1899-01-01', 'bad'])
      await a.patch('/api/social/me').send({ username: me.username, bio: '', birthday }).expect(400);
    await a
      .patch('/api/social/me')
      .send({ username: 'Новый профиль', bio: 'Моё описание', birthday: '2000-02-29' })
      .expect(200);
    const view = (await b.get('/api/social/profile/' + me.publicId)).body;
    expect(view.birthday).toBe('2000-02-29');
    expect(view.bio).toBe('Моё описание');
    expect(view.email).toBeUndefined();
    expect(view.phone).toBeUndefined();
    // Reopening an authenticated session gets the same persisted settings.
    const again = request.agent(app.app);
    await again
      .post('/api/auth/login')
      .send({ email: users[0].email, password: 'Strong-test-password!' })
      .expect(200);
    expect((await again.get('/api/collection')).body.appearance.style).toEqual(style);
    await a.post('/api/social/friends/' + other.publicId).send({});
    await b.post('/api/social/friends/' + me.publicId).send({});
    await a
      .post('/api/collection/gifts/' + items[0] + '/send')
      .send({ targetId: other.publicId })
      .expect(200);
    const after = (await a.get('/api/collection')).body.appearance;
    expect(after.statusGift).toBeNull();
    expect(after.style.statusGiftId).toBe('');
    expect(after.featured).toHaveLength(5);
    await a.patch('/api/social/me').send({ username: me.username, bio: '', birthday: '' }).expect(200);
    expect((await b.get('/api/social/profile/' + me.publicId)).body.birthday).toBe('');
  } finally {
    app.close();
  }
});
