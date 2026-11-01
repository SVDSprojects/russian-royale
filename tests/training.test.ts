import { it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';

it('keeps the review queue private, uses the latest attempt even at equal timestamps, and hides draft content', async () => {
  const instance = createApp({ dbPath: ':memory:', testMode: true, now: () => 1800000000000 });
  try {
    const first = request.agent(instance.app),
      second = request.agent(instance.app);
    for (const [i, client] of [first, second].entries()) {
      await client
        .post('/api/auth/register')
        .send({
          email: `review${i}@example.test`,
          username: `Игрок ${i}`,
          password: 'Training-test-password!',
        })
        .expect(201);
    }
    await request(instance.app).get('/api/training').expect(401);
    const original = (await first.get('/api/training').expect(200)).body.exercises;
    expect(original.length).toBeGreaterThan(0);
    expect(original.every((e: any) => !e.needsReview && !('answer' in e) && !('explanation' in e))).toBe(
      true,
    );
    const exercise = instance.db.prepare('SELECT * FROM exercises WHERE id=?').get(original[0].id);
    await first.post(`/api/exercises/${exercise.id}/answer`).send({ answer: 'заведомая ошибка' }).expect(200);
    expect(
      (await first.get('/api/training')).body.exercises.find((e: any) => e.id === exercise.id).needsReview,
    ).toBe(true);
    expect((await second.get('/api/training')).body.exercises.every((e: any) => !e.needsReview)).toBe(true);
    await first.post(`/api/exercises/${exercise.id}/answer`).send({ answer: exercise.answer }).expect(200);
    expect(
      (await first.get('/api/training')).body.exercises.find((e: any) => e.id === exercise.id).needsReview,
    ).toBe(false);
    await first.post(`/api/exercises/${exercise.id}/answer`).send({ answer: 'снова ошибка' }).expect(200);
    expect(
      (await first.get('/api/training')).body.exercises.find((e: any) => e.id === exercise.id).needsReview,
    ).toBe(true);
    instance.db.prepare('UPDATE exercises SET published=0 WHERE id=?').run(exercise.id);
    expect((await first.get('/api/training')).body.exercises.some((e: any) => e.id === exercise.id)).toBe(
      false,
    );
    instance.db.prepare('UPDATE rules SET published=0 WHERE id=?').run(exercise.rule_id);
    expect((await first.get('/api/training')).body.exercises).toHaveLength(0);
  } finally {
    instance.close();
  }
});
