import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
it('preferences persist and friend notifications respect ownership and opt-out', async () => {
  const a = createApp({ dbPath: ':memory:', testMode: true });
  try {
    const c = request.agent(a.app),
      d = request.agent(a.app);
    for (const [i, x] of [c, d].entries())
      await x
        .post('/api/auth/register')
        .send({ username: 'Друг ' + i, email: `notice${i}@test.ru`, password: 'Strong-test-password!' })
        .expect(201);
    const p = (await c.get('/api/social/me')).body.me,
      q = (await d.get('/api/social/me')).body.me;
    await c.patch('/api/preferences').send({ theme: 'dark', notifications: true }).expect(200);
    expect((await c.get('/api/preferences')).body.theme).toBe('dark');
    await c
      .post('/api/social/friends/' + q.publicId)
      .send({})
      .expect(200);
    const notices = (await d.get('/api/notifications')).body.notifications;
    expect(notices).toHaveLength(1);
    expect(notices[0].readAt).toBeNull();
    expect((await c.get('/api/notifications')).body.notifications).toHaveLength(0);
    await c.post('/api/notifications/read').send({ id: notices[0].id }).expect(200);
    expect((await d.get('/api/notifications')).body.notifications[0].readAt).toBeNull();
    await d.post('/api/notifications/read').send({}).expect(200);
    expect((await d.get('/api/notifications')).body.notifications[0].readAt).not.toBeNull();
    await d
      .post('/api/social/friends/' + p.publicId)
      .send({})
      .expect(200);
    expect((await c.get('/api/notifications')).body.notifications[0].title).toBe('Заявка принята');
    await c.patch('/api/preferences').send({ theme: 'light', notifications: false }).expect(200);
    await d.delete('/api/social/friends/' + p.publicId).expect(200);
    await d
      .post('/api/social/friends/' + p.publicId)
      .send({})
      .expect(200);
    expect((await c.get('/api/notifications')).body.notifications).toHaveLength(1);
    await c.patch('/api/preferences').send({ theme: 'evil', notifications: true }).expect(400);
  } finally {
    a.close();
  }
});
