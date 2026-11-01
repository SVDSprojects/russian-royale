import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Stage 1–2: authentication, authorization and editable learning content', () => {
  let ctx: ReturnType<typeof createApp>,
    temp: string,
    admin: any,
    player: any,
    adminId: string,
    playerId: string;
  beforeEach(async () => {
    temp = mkdtempSync(join(tmpdir(), 'rr-foundation-'));
    ctx = createApp({ dbPath: join(temp, 'test.sqlite'), testMode: true });
    admin = request.agent(ctx.app);
    player = request.agent(ctx.app);
    let r = await admin
      .post('/api/auth/register')
      .send({ email: 'admin@example.test', username: 'Редактор', password: 'a-strong-password' });
    expect(r.status).toBe(201);
    adminId = r.body.user.id;
    ctx.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(adminId);
    r = await player
      .post('/api/auth/register')
      .send({ email: 'player@example.test', username: 'Игрок', password: 'another-password', role: 'admin' });
    expect(r.status).toBe(201);
    playerId = r.body.user.id;
  });
  afterEach(() => {
    ctx?.close();
    if (temp) rmSync(temp, { recursive: true, force: true });
  });

  it('stores hashed passwords, keeps opaque HttpOnly sessions and ignores requested registration role', async () => {
    const user = (await player.get('/api/auth/me')).body.user;
    expect(user.role).toBe('player');
    expect(user).not.toHaveProperty('password_hash');
    const row = ctx.db.prepare('SELECT * FROM users WHERE id=?').get(playerId);
    expect(row.password_hash.startsWith('scrypt:')).toBe(true);
    expect(row.password_hash).not.toContain('another-password');
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'player@example.test', password: 'another-password' });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/login')
          .send({ email: 'player@example.test', password: 'wrong-password' })
      ).status,
    ).toBe(401);
    expect((await player.post('/api/auth/logout')).status).toBe(200);
    expect((await player.get('/api/auth/me')).body.user).toBeNull();
    expect((await player.get('/api/profile')).status).toBe(401);
  });

  it('rejects cross-origin mutations, rejects player privilege escalation and protects the last admin', async () => {
    expect(
      (
        await admin
          .post('/api/admin/categories')
          .set('Origin', 'https://evil.example')
          .send({ name: 'Подмена' })
      ).status,
    ).toBe(403);
    expect((await player.get('/api/admin/rules')).status).toBe(403);
    expect((await player.patch('/api/admin/users/' + playerId).send({ role: 'admin' })).status).toBe(403);
    expect((await admin.patch('/api/admin/users/' + adminId).send({ role: 'player' })).status).toBe(409);
    expect((await admin.patch('/api/admin/users/' + playerId).send({ role: 'editor' })).status).toBe(200);
    expect((await player.get('/api/admin/rules')).status).toBe(200);
    expect((await player.get('/api/admin/users')).status).toBe(403);
    expect((await player.patch('/api/admin/users/' + playerId).send({ role: 'admin' })).status).toBe(403);
  });

  it('seeds exactly one deletable rule and four tasks; edits, hides, replaces and never re-seeds deleted content', async () => {
    const initial = (await admin.get('/api/admin/rules')).body;
    expect(initial).toHaveLength(1);
    expect(initial[0].title).toBe('Суффиксы -ЕК- и -ИК-');
    expect((await admin.get('/api/admin/exercises')).body).toHaveLength(4);
    const rule = initial[0];
    expect(
      (
        await admin
          .put('/api/admin/rules/' + rule.id)
          .send({ ...rule, title: 'Проверенное правило', published: false })
      ).status,
    ).toBe(200);
    expect((await player.get('/api/rules')).body).toHaveLength(0);
    expect((await player.get('/api/rules/' + rule.id)).status).toBe(404);
    expect((await admin.delete('/api/admin/rules/' + rule.id)).status).toBe(200);
    expect((await admin.get('/api/admin/exercises')).body).toHaveLength(0);
    expect((await player.get('/api/lessons')).body).toHaveLength(0);
    ctx.close();
    ctx = createApp({ dbPath: join(temp, 'test.sqlite'), testMode: true });
    admin = request.agent(ctx.app);
    await admin.post('/api/auth/login').send({ email: 'admin@example.test', password: 'a-strong-password' });
    expect((await admin.get('/api/admin/rules')).body).toHaveLength(0);
    const created = await admin
      .post('/api/admin/rules')
      .send({
        ...rule,
        title: 'Совершенно новая тема',
        explanation: 'Новые материалы редактора',
        published: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.id).not.toBe(rule.id);
    expect((await request(ctx.app).get('/api/rules')).body[0].title).toBe('Совершенно новая тема');
  });

  it('does not reveal answers before submission, checks publication and awards task/lesson XP only once', async () => {
    const rule = (await player.get('/api/rules')).body[0];
    const details = (await player.get('/api/rules/' + rule.id)).body;
    expect(details.exercises).toHaveLength(4);
    for (const task of details.exercises) {
      expect(task).not.toHaveProperty('answer');
      expect(task).not.toHaveProperty('explanation');
    }
    const lesson = (await player.get('/api/lessons')).body[0];
    expect((await player.post('/api/lessons/' + lesson.id + '/complete')).status).toBe(409);
    const tasks = (await admin.get('/api/admin/exercises')).body;
    let answer = await player.post('/api/exercises/' + tasks[0].id + '/answer').send({ answer: 'wrong' });
    expect(answer.body.correct).toBe(false);
    expect(answer.body.xpAwarded).toBe(0);
    expect(answer.body.answer).toBe(tasks[0].answer);
    for (const task of tasks) {
      answer = await player
        .post('/api/exercises/' + task.id + '/answer')
        .send({ answer: task.answer.toLowerCase() });
      expect(answer.body.correct).toBe(true);
      expect(answer.body.xpAwarded).toBe(5);
    }
    answer = await player.post('/api/exercises/' + tasks[0].id + '/answer').send({ answer: tasks[0].answer });
    expect(answer.body.xpAwarded).toBe(0);
    let complete = await player.post('/api/lessons/' + lesson.id + '/complete');
    expect(complete.body.xpAwarded).toBe(20);
    complete = await player.post('/api/lessons/' + lesson.id + '/complete');
    expect(complete.body.xpAwarded).toBe(0);
    expect((await player.get('/api/profile')).body.user.xp).toBe(40);
    expect((await player.get('/api/progress')).body.completedLessons).toContain(lesson.id);
    await admin.put('/api/admin/rules/' + rule.id).send({ ...rule, published: false });
    expect(
      (await player.post('/api/exercises/' + tasks[0].id + '/answer').send({ answer: tasks[0].answer }))
        .status,
    ).toBe(404);
  });

  it('supports task CRUD and unpublishes dependent lessons when a task is removed', async () => {
    const rule = (await admin.get('/api/admin/rules')).body[0];
    const created = await admin
      .post('/api/admin/exercises')
      .send({
        ruleId: rule.id,
        type: 'multiple',
        prompt: 'Выберите ответы',
        options: ['А', 'Б', 'В'],
        answer: 'А;В',
        published: true,
      });
    expect(created.status).toBe(201);
    expect(
      (await player.post('/api/exercises/' + created.body.id + '/answer').send({ answer: 'в;а' })).body
        .correct,
    ).toBe(true);
    const edited = await admin
      .put('/api/admin/exercises/' + created.body.id)
      .send({ ...created.body, prompt: 'Новое условие' });
    expect(edited.body.prompt).toBe('Новое условие');
    const lesson = (await admin.get('/api/admin/lessons')).body[0];
    const eid = lesson.blocks.find((b: any) => b.type === 'exercise').exerciseId;
    expect((await admin.delete('/api/admin/exercises/' + eid)).status).toBe(200);
    expect((await player.get('/api/lessons')).body).toHaveLength(0);
    const after = (await admin.get('/api/admin/lessons')).body[0];
    expect(after.published).toBe(false);
    expect(after.blocks.some((b: any) => b.exerciseId === eid)).toBe(false);
    expect((await admin.delete('/api/admin/exercises/' + created.body.id)).status).toBe(200);
  });

  it('keeps answer and completed lesson history after deleting a rule', async () => {
    const rule = (await admin.get('/api/admin/rules')).body[0],
      tasks = (await admin.get('/api/admin/exercises')).body,
      lesson = (await player.get('/api/lessons')).body[0];
    for (const t of tasks) await player.post('/api/exercises/' + t.id + '/answer').send({ answer: t.answer });
    await player.post('/api/lessons/' + lesson.id + '/complete');
    await admin.delete('/api/admin/rules/' + rule.id);
    const profile = (await player.get('/api/profile')).body;
    expect(profile.stats.lessons).toBe(1);
    expect(profile.history.filter((a: any) => a.type === 'exercise')).toHaveLength(4);
    expect(profile.history.find((a: any) => a.type === 'exercise').topicTitle).toBe(rule.title);
  });

  it('validates import before writing and records administrator actions', async () => {
    const rule = (await admin.get('/api/admin/rules')).body[0];
    const invalid = {
      rules: [
        { ...rule, title: 'Валидный' },
        { ...rule, title: '' },
      ],
    };
    const preview = await admin.post('/api/admin/import/preview').send(invalid);
    expect(preview.body.valid).toBe(false);
    expect((await admin.post('/api/admin/import').send(invalid)).status).toBe(400);
    expect((await admin.get('/api/admin/rules')).body).toHaveLength(1);
    expect(
      (await admin.post('/api/admin/import').send({ rules: [{ ...rule, title: 'Импортированное' }] })).status,
    ).toBe(201);
    expect((await admin.get('/api/admin/rules')).body).toHaveLength(2);
    expect((await admin.get('/api/admin/audit')).body.some((a: any) => a.action === 'content.import')).toBe(
      true,
    );
  });

  it('persists teacher configuration and rejects executable or invalid uploads', async () => {
    const teacher = (await player.get('/api/teacher')).body;
    teacher.name = 'Анна Петровна';
    teacher.phrases.correct = 'Получилось!';
    expect((await admin.put('/api/admin/teacher').send(teacher)).status).toBe(200);
    expect((await player.get('/api/teacher')).body.name).toBe('Анна Петровна');
    expect(
      (await admin.post('/api/admin/uploads').send({ data: 'data:image/svg+xml;base64,PHN2Zz4=' })).status,
    ).toBe(400);
    expect(
      (await admin.post('/api/admin/uploads').send({ data: 'data:image/png;base64,ZmFrZQ==' })).status,
    ).toBe(400);
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEPsAAAAASUVORK5CYII=';
    const upload = await admin.post('/api/admin/uploads').send({ data: png });
    expect(upload.status).toBe(201);
    expect(upload.body.url).toMatch(/^\/uploads\/[a-f0-9-]+\.webp$/);
    expect((await request(ctx.app).get(upload.body.url)).headers['content-type']).toContain('image/webp');
  });
});
