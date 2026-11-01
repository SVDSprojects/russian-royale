import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
it('email codes verify signup, rate limit, reset password once and revoke sessions', async () => {
  let now = Date.now();
  const sent: { email: string; purpose: string; code: string }[] = [];
  const a = createApp({
    dbPath: ':memory:',
    testMode: true,
    now: () => now,
    emailDelivery: {
      secret: 'test-secret-for-tests-only-long-enough',
      send: async (email, purpose, code) => {
        sent.push({ email, purpose, code });
      },
    },
  });
  try {
    const c = request.agent(a.app);
    expect((await c.get('/api/auth/status')).body.emailCodesEnabled).toBe(true);
    await c
      .post('/api/auth/register')
      .send({ email: 'codes@test.ru', username: 'Коды', password: 'Strong-test-password!' })
      .expect(400);
    await c.post('/api/auth/email-code').send({ email: 'codes@test.ru', purpose: 'register' }).expect(200);
    await c.post('/api/auth/email-code').send({ email: 'codes@test.ru', purpose: 'register' }).expect(429);
    expect(JSON.stringify(a.db.prepare('SELECT * FROM rr_email_codes').get())).not.toContain(sent[0].code);
    await c
      .post('/api/auth/register')
      .send({
        email: 'codes@test.ru',
        username: 'Коды',
        password: 'Strong-test-password!',
        code: sent[0].code,
      })
      .expect(201);
    expect(a.db.prepare('SELECT COUNT(*) AS n FROM rr_verified_emails').get().n).toBe(1);
    now += 61000;
    await c.post('/api/auth/email-code').send({ email: 'codes@test.ru', purpose: 'reset' }).expect(200);
    const code = sent.at(-1)!.code;
    await c
      .post('/api/auth/reset-password')
      .send({ email: 'codes@test.ru', code: '000000', password: 'Another-strong-password!' })
      .expect(400);
    await c
      .post('/api/auth/reset-password')
      .send({ email: 'codes@test.ru', code, password: 'Another-strong-password!' })
      .expect(200);
    await c
      .post('/api/auth/reset-password')
      .send({ email: 'codes@test.ru', code, password: 'Another-strong-password!' })
      .expect(400);
    expect((await c.get('/api/auth/me')).body.user).toBeNull();
    await c
      .post('/api/auth/login')
      .send({ email: 'codes@test.ru', password: 'Strong-test-password!' })
      .expect(401);
    await c
      .post('/api/auth/login')
      .send({ email: 'codes@test.ru', password: 'Another-strong-password!' })
      .expect(200);
    now += 61000;
    const publicReply = await c
      .post('/api/auth/email-code')
      .send({ email: 'missing@test.ru', purpose: 'reset' })
      .expect(200);
    expect(publicReply.body.message).toContain('Если');
    expect(sent).toHaveLength(2);
  } finally {
    a.close();
  }
});
it('five attempts lock a code and expiry rejects an otherwise correct code', async () => {
  let now = Date.now(),
    code = '';
  const a = createApp({
    dbPath: ':memory:',
    testMode: true,
    now: () => now,
    emailDelivery: {
      secret: 'a-test-secret-not-used-in-production',
      send: async (_e, _p, c) => {
        code = c;
      },
    },
  });
  try {
    const c = request(a.app);
    await c.post('/api/auth/email-code').send({ email: 'attempts@test.ru', purpose: 'register' }).expect(200);
    for (let i = 0; i < 5; i++)
      await c
        .post('/api/auth/register')
        .send({
          email: 'attempts@test.ru',
          username: 'Попытки',
          password: 'Strong-test-password!',
          code: '000000',
        })
        .expect(400);
    await c
      .post('/api/auth/register')
      .send({ email: 'attempts@test.ru', username: 'Попытки', password: 'Strong-test-password!', code })
      .expect(400);
    now += 61000;
    await c.post('/api/auth/email-code').send({ email: 'attempts@test.ru', purpose: 'register' }).expect(200);
    now += 600001;
    await c
      .post('/api/auth/register')
      .send({ email: 'attempts@test.ru', username: 'Попытки', password: 'Strong-test-password!', code })
      .expect(400);
  } finally {
    a.close();
  }
});
it('unconfigured provider never claims mail was sent', async () => {
  const a = createApp({ dbPath: ':memory:', testMode: true });
  try {
    expect((await request(a.app).get('/api/auth/status')).body.emailCodesEnabled).toBe(false);
    await request(a.app)
      .post('/api/auth/email-code')
      .send({ email: 'nobody@test.ru', purpose: 'reset' })
      .expect(503);
  } finally {
    a.close();
  }
});
