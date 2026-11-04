import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';

it('reserves Hayk ID by email and grants and revokes staff badges from real roles', async () => {
  const a = createApp({ dbPath: ':memory:', testMode: true });
  async function register(email: string, username: string) {
    const client = request.agent(a.app);
    const user = (
      await client
        .post('/api/auth/register')
        .send({ email, username, password: 'Strong-password-test!' })
        .expect(201)
    ).body.user;
    await client.get('/api/social/me').expect(200);
    return { client, user };
  }
  try {
    const impostor = await register('not-hayk@example.test', 'Hayk');
    a.db.prepare("UPDATE rr_profiles SET public_id='000007' WHERE user_id=?").run(impostor.user.id);
    const hayk = await register('hayksargsyan865@gmail.com', 'Другой ник');
    expect((await hayk.client.get('/api/social/me')).body.me.publicId).toBe('000007');
    expect((await impostor.client.get('/api/social/me')).body.me.publicId).not.toBe('000007');
    const owner = await register('vbarsegan363@gmail.com', 'CEO');
    a.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(owner.user.id);
    for (const role of ['moderator', 'editor', 'admin', 'player']) {
      await owner.client
        .patch('/api/admin/users/' + hayk.user.id)
        .send({ role })
        .expect(200);
      const me = (await hayk.client.get('/api/auth/me')).body.user;
      expect(me.verificationBadge).toBe(
        role === 'player' ? null : role === 'moderator' ? 'moderator' : 'staff',
      );
      const identities = (await owner.client.get('/api/identities')).body;
      expect(identities.find((i: any) => i.id === owner.user.id).verificationBadge).toBe('founder');
      expect(identities.find((i: any) => i.id === hayk.user.id)?.verificationBadge || null).toBe(
        role === 'player' ? null : role === 'moderator' ? 'moderator' : 'staff',
      );
      expect(JSON.stringify(identities)).not.toContain('hayksargsyan865@gmail.com');
    }
    await hayk.client
      .patch('/api/social/me')
      .send({ username: 'CEO', bio: '', verificationBadge: 'founder', role: 'admin' })
      .expect(200);
    expect((await hayk.client.get('/api/auth/me')).body.user.verificationBadge).toBeNull();
  } finally {
    a.close();
  }
});
