import type { DB } from './storage.js';
import { transaction } from './storage.js';
import { id, iso } from './core.js';

export function seed(db: DB) {
  if (db.prepare("SELECT key FROM seed_metadata WHERE key='demo-content-v1'").get()) return;
  // Early development databases marked the seed as migration 2. Preserve that
  // state while keeping migration 2 available to the multiplayer schema.
  if (db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) {
    db.prepare("INSERT INTO seed_metadata(key,applied_at) VALUES('demo-content-v1',?)").run(iso());
    return;
  }
  transaction(db, () => {
    const category = id(),
      rule = id(),
      lesson = id(),
      time = iso();
    db.prepare('INSERT INTO categories(id,name) VALUES(?,?)').run(category, 'Орфография');
    db.prepare(
      `INSERT INTO rules(id,title,category_id,subcategory,summary,explanation,examples,mistakes,images,difficulty,games,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      rule,
      'Суффиксы -ЕК- и -ИК-',
      category,
      'Суффиксы существительных',
      'Измените форму слова: исчезла гласная — пишите Е, сохранилась — И.',
      'В существительных пишется суффикс -ЕК-, если при изменении формы слова гласная выпадает: замочек — замочка. Если гласная сохраняется, пишется суффикс -ИК-: ключик — ключика.',
      JSON.stringify([
        'Замочек — замочка: гласная выпадает, пишем Е.',
        'Ключик — ключика: гласная сохраняется, пишем И.',
      ]),
      JSON.stringify(['Не выбирайте букву на слух. Сначала измените форму существительного.']),
      '[]',
      1,
      '["spy"]',
      1,
      time,
      time,
    );
    const tasks = [
      ['Замоч_к', 'Е', 'Замочек — замочка. Гласная исчезла: пишем Е.'],
      ['Ключ_к', 'И', 'Ключик — ключика. Гласная сохраняется: пишем И.'],
      ['Платоч_к', 'Е', 'Платочек — платочка. Гласная исчезла: пишем Е.'],
      ['Мяч_к', 'И', 'Мячик — мячика. Гласная сохраняется: пишем И.'],
    ];
    const exerciseIds = tasks.map(([prompt, answer, explanation]) => {
      const eid = id();
      db.prepare(
        'INSERT INTO exercises(id,rule_id,type,prompt,options,answer,explanation,difficulty,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ).run(eid, rule, 'letter', prompt, '["Е","И"]', answer, explanation, 1, 1, time, time);
      return eid;
    });
    const blocks = [
      {
        id: id(),
        type: 'dialogue',
        text: 'Так, мои дорогие, сегодня разбираемся с суффиксами! У нас есть один надёжный способ проверки.',
        emotion: 'neutral',
      },
      {
        id: id(),
        type: 'explanation',
        text: 'Измените форму слова. Если гласная в суффиксе выпадает — пишите Е. Если сохраняется — пишите И.',
        emotion: 'explaining',
      },
      {
        id: id(),
        type: 'example',
        text: 'Замочек → замочка: Е исчезает. Ключик → ключика: И остаётся. Теперь ваша очередь!',
        emotion: 'surprised',
      },
      ...exerciseIds.map((exerciseId) => ({ id: id(), type: 'exercise', exerciseId, emotion: 'explaining' })),
      {
        id: id(),
        type: 'result',
        text: 'Отлично! Теперь суффиксы не смогут вас запутать. Возвращайтесь к правилу, когда понадобится повторение.',
        emotion: 'happy',
      },
    ];
    db.prepare(
      'INSERT INTO lessons(id,rule_id,title,published,blocks,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    ).run(lesson, rule, 'Секрет исчезающей гласной', 1, JSON.stringify(blocks), time, time);
    const images = Object.fromEntries(
      ['neutral', 'happy', 'strict', 'surprised', 'explaining'].map((emotion) => [
        emotion,
        `/assets/teacher-${emotion}.png`,
      ]),
    );
    db.prepare('INSERT INTO teacher(id,config) VALUES(1,?)').run(
      JSON.stringify({
        name: 'Мария Ивановна',
        images,
        phrases: {
          intro: 'Ну что, мои дорогие, начнём?',
          correct: 'Верно! Вы отлично разобрались.',
          incorrect: 'Почти! Давайте проверим форму слова ещё раз.',
          complete: 'Прекрасная работа. Урок пройден!',
        },
      }),
    );
    db.prepare("INSERT INTO seed_metadata(key,applied_at) VALUES('demo-content-v1',?)").run(time);
  });
}
