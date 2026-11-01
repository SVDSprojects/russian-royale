import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { addContentPack, expansion } from '../server/content-pack';

it('adds nine editable rules, 36 checked exercises and nine lessons once without restoring deletions', async () => {
  const instance = createApp({ dbPath: ':memory:', testMode: true });
  try {
    const original = instance.db.prepare('SELECT id FROM rules').get().id;
    addContentPack(instance.db);
    addContentPack(instance.db);
    expect(expansion).toHaveLength(9);
    expect(instance.db.prepare('SELECT count(*) n FROM rules').get().n).toBe(10);
    expect(instance.db.prepare('SELECT count(*) n FROM exercises').get().n).toBe(40);
    expect(instance.db.prepare('SELECT count(*) n FROM lessons').get().n).toBe(10);
    const client = request.agent(instance.app);
    await client
      .post('/api/auth/register')
      .send({ email: 'pack@test.example', username: 'Проверка правил', password: 'Content-pack-test-2026!' })
      .expect(201);
    for (const exercise of instance.db.prepare('SELECT * FROM exercises WHERE rule_id<>?').all(original)) {
      expect(JSON.parse(exercise.options)).toContain(exercise.answer);
      const rule = await client.get('/api/rules/' + exercise.rule_id).expect(200);
      expect(rule.body.exercises.find((item: any) => item.id === exercise.id).answer).toBeUndefined();
      const response = await client
        .post(`/api/exercises/${exercise.id}/answer`)
        .send({ answer: exercise.answer })
        .expect(200);
      expect(response.body.correct).toBe(true);
    }
    const edited = instance.db.prepare('SELECT id FROM rules WHERE id<>? LIMIT 1').get(original).id;
    instance.db.prepare('UPDATE rules SET title=? WHERE id=?').run('Редактор изменил название', edited);
    instance.db.prepare('DELETE FROM rules WHERE id<>? AND id<>?').run(original, edited);
    addContentPack(instance.db);
    expect(instance.db.prepare('SELECT count(*) n FROM rules').get().n).toBe(2);
    expect(instance.db.prepare('SELECT title FROM rules WHERE id=?').get(edited).title).toBe(
      'Редактор изменил название',
    );
  } finally {
    instance.close();
  }
});
