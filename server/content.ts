import type { Express, RequestHandler, Request } from 'express';
import type { DB } from './storage.js';
import { transaction } from './storage.js';
import { setupStreaks, userStreak } from './streak';
import { streakDay } from '../shared/streak';
import {
  boolean,
  body,
  HttpError,
  id,
  imagePath,
  integer,
  iso,
  list,
  norm,
  publicUser,
  str,
  type Role,
} from './core.js';

const emotions = ['neutral', 'happy', 'strict', 'surprised', 'explaining'];
const blockTypes = [
  'dialogue',
  'explanation',
  'example',
  'image',
  'exercise',
  'check',
  'animation',
  'result',
];
const exerciseTypes = [
  'letter',
  'choice',
  'multiple',
  'word',
  'correction',
  'punctuation',
  'matching',
  'stress',
  'text',
];
const parse = (s: string) => JSON.parse(s);
export function mapRule(r: any) {
  return {
    id: r.id,
    title: r.title,
    categoryId: r.category_id,
    category: r.category,
    subcategory: r.subcategory,
    summary: r.summary,
    explanation: r.explanation,
    examples: parse(r.examples),
    mistakes: parse(r.mistakes),
    images: parse(r.images),
    difficulty: r.difficulty,
    games: parse(r.games),
    published: !!r.published,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapExercise(r: any, secret = false) {
  const result: any = {
    id: r.id,
    ruleId: r.rule_id,
    type: r.type,
    prompt: r.prompt,
    options: parse(r.options),
    difficulty: r.difficulty,
    examNumber: r.exam_number,
    published: !!r.published,
  };
  if (secret) {
    result.answer = r.answer;
    result.explanation = r.explanation;
  }
  return result;
}
function mapLesson(r: any) {
  return { id: r.id, ruleId: r.rule_id, title: r.title, published: !!r.published, blocks: parse(r.blocks) };
}
const ruleQuery = 'SELECT r.*,c.name category FROM rules r JOIN categories c ON c.id=r.category_id';
const safeAnswer = (answer: string, type: string) =>
  ['multiple', 'matching'].includes(type)
    ? [...new Set(answer.split(';').map(norm).filter(Boolean))].sort().join(';')
    : norm(answer);

export function setupContent(
  app: Express,
  ctx: {
    db: DB;
    requireAuth: RequestHandler;
    requireRole: (...r: Role[]) => RequestHandler;
    now: () => number;
    broadcast: () => void;
    uploadsDir: string;
    saveImage: (buffer: Buffer, format: string) => Promise<string>;
    onlineUsers: Map<string, number>;
  },
) {
  const { db, requireAuth, requireRole, now, broadcast, uploadsDir, onlineUsers } = ctx;
  const edit = requireRole('admin', 'editor');
  const admin = requireRole('admin');
  setupStreaks(db);
  db.exec(
    'CREATE TABLE IF NOT EXISTS rr_admin_xp_commands(actor_id TEXT NOT NULL REFERENCES users(id),command_id TEXT NOT NULL,target_id TEXT NOT NULL REFERENCES users(id),delta INTEGER NOT NULL,reason TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor_id,command_id))',
  );
  const audit = (actor: string, action: string, target: string, details: any = {}) =>
    db
      .prepare('INSERT INTO audit_log(id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)')
      .run(id(), actor, action, target, JSON.stringify(details), iso(now()));
  const getRule = (rid: string, published = false) => {
    const r = db.prepare(ruleQuery + ' WHERE r.id=?' + (published ? ' AND r.published=1' : '')).get(rid);
    if (!r) throw new HttpError(404, 'Правило не найдено.');
    return mapRule(r);
  };
  const checkRule = (rid: unknown) => {
    const value = str(rid, 'Правило', 1, 100);
    getRule(value);
    return value;
  };
  const getLesson = (lid: string, published = false) => {
    const row = db
      .prepare(
        'SELECT l.* FROM lessons l JOIN rules r ON r.id=l.rule_id WHERE l.id=?' +
          (published ? ' AND l.published=1 AND r.published=1' : ''),
      )
      .get(lid);
    if (!row) throw new HttpError(404, 'Урок не найден.');
    return mapLesson(row);
  };
  function ruleData(b: Record<string, any>) {
    const categoryId = str(b.categoryId, 'Категория', 1, 100);
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(categoryId))
      throw new HttpError(400, 'Категория не найдена.');
    return {
      title: str(b.title, 'Название', 2, 160),
      categoryId,
      subcategory: str(b.subcategory ?? '', 'Подкатегория', 0, 160),
      summary: str(b.summary ?? '', 'Краткое описание', 0, 1000),
      explanation: str(b.explanation, 'Объяснение', 1, 30000),
      examples: list(b.examples, 'Примеры'),
      mistakes: list(b.mistakes, 'Ошибки'),
      images: list(b.images, 'Изображения', 20, 500).map(imagePath),
      difficulty: integer(b.difficulty, 'Сложность', 1, 3, 1),
      games: list(b.games ?? ['spy'], 'Игры', 10, 30),
      published: boolean(b.published),
    };
  }
  function exerciseData(b: Record<string, any>) {
    const type = str(b.type, 'Тип', 1, 30);
    if (!exerciseTypes.includes(type)) throw new HttpError(400, 'Неизвестный тип задания.');
    return {
      ruleId: checkRule(b.ruleId),
      type,
      prompt: str(b.prompt, 'Условие', 1, 10000),
      options: list(b.options, 'Варианты', 100, 2000),
      answer: str(b.answer, 'Ответ', 1, 10000),
      explanation: str(b.explanation ?? '', 'Объяснение', 0, 10000),
      difficulty: integer(b.difficulty, 'Сложность', 1, 3, 1),
      examNumber:
        b.examNumber === undefined || b.examNumber === null || b.examNumber === ''
          ? null
          : integer(Number(b.examNumber), 'Номер задания', 1, 100),
      published: boolean(b.published),
    };
  }
  function lessonData(b: Record<string, any>) {
    const ruleId = checkRule(b.ruleId),
      published = boolean(b.published);
    if (!Array.isArray(b.blocks) || b.blocks.length > 100)
      throw new HttpError(400, 'Урок должен содержать до 100 блоков.');
    const seen = new Set();
    const blocks = b.blocks.map((block: any) => {
      if (!block || typeof block !== 'object') throw new HttpError(400, 'Неверный блок урока.');
      const type = str(block.type, 'Тип блока', 1, 30);
      if (!blockTypes.includes(type)) throw new HttpError(400, 'Неизвестный тип блока.');
      const bid = typeof block.id === 'string' ? str(block.id, 'ID блока', 1, 100) : id();
      if (seen.has(bid)) throw new HttpError(400, 'ID блоков не должны повторяться.');
      seen.add(bid);
      const result: any = { id: bid, type };
      if (block.text !== undefined) result.text = str(block.text, 'Текст блока', 0, 10000);
      if (block.image) result.image = imagePath(block.image);
      if (block.emotion) {
        if (!emotions.includes(block.emotion)) throw new HttpError(400, 'Неизвестная эмоция.');
        result.emotion = block.emotion;
      }
      if (['exercise', 'check'].includes(type)) {
        const eid = str(block.exerciseId, 'Задание блока', 1, 100);
        const e = db.prepare('SELECT * FROM exercises WHERE id=? AND rule_id=?').get(eid, ruleId);
        if (!e) throw new HttpError(400, 'Задание блока должно относиться к правилу этого урока.');
        if (published && !e.published) throw new HttpError(400, 'Сначала опубликуйте задания урока.');
        result.exerciseId = eid;
      }
      return result;
    });
    if (published && !blocks.length) throw new HttpError(400, 'Опубликованный урок не может быть пустым.');
    return { ruleId, title: str(b.title, 'Название', 2, 160), published, blocks };
  }
  function insertRule(data: any, rid = id()) {
    const t = iso(now());
    db.prepare(
      'INSERT INTO rules(id,title,category_id,subcategory,summary,explanation,examples,mistakes,images,difficulty,games,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      rid,
      data.title,
      data.categoryId,
      data.subcategory,
      data.summary,
      data.explanation,
      JSON.stringify(data.examples),
      JSON.stringify(data.mistakes),
      JSON.stringify(data.images),
      data.difficulty,
      JSON.stringify(data.games),
      +data.published,
      t,
      t,
    );
    return rid;
  }
  function insertExercise(data: any, eid = id()) {
    const t = iso(now());
    db.prepare(
      'INSERT INTO exercises(id,rule_id,type,prompt,options,answer,explanation,difficulty,exam_number,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      eid,
      data.ruleId,
      data.type,
      data.prompt,
      JSON.stringify(data.options),
      data.answer,
      data.explanation,
      data.difficulty,
      data.examNumber,
      +data.published,
      t,
      t,
    );
    return eid;
  }
  function invalidateLessonsForExercise(eid: string, remove = false) {
    for (const lesson of db.prepare('SELECT * FROM lessons').all()) {
      const blocks = parse(lesson.blocks);
      if (blocks.some((b: any) => b.exerciseId === eid)) {
        db.prepare('UPDATE lessons SET published=0,blocks=?,updated_at=? WHERE id=?').run(
          JSON.stringify(remove ? blocks.filter((b: any) => b.exerciseId !== eid) : blocks),
          iso(now()),
          lesson.id,
        );
      }
    }
  }
  app.get('/api/categories', (_req, res) =>
    res.json(db.prepare('SELECT * FROM categories ORDER BY name').all()),
  );
  app.get('/api/rules', (_req, res) =>
    res.json(
      db
        .prepare(ruleQuery + ' WHERE r.published=1 ORDER BY r.created_at DESC')
        .all()
        .map(mapRule),
    ),
  );
  app.get('/api/rules/:id', (req, res) =>
    res.json({
      ...getRule(String(req.params.id), true),
      exercises: db
        .prepare('SELECT * FROM exercises WHERE rule_id=? AND published=1 ORDER BY created_at,id')
        .all(req.params.id)
        .map((r) => mapExercise(r)),
    }),
  );
  app.get('/api/lessons', (_req, res) =>
    res.json(
      db
        .prepare(
          'SELECT l.* FROM lessons l JOIN rules r ON r.id=l.rule_id WHERE l.published=1 AND r.published=1 ORDER BY l.created_at',
        )
        .all()
        .map(mapLesson),
    ),
  );
  app.get('/api/lessons/:id', (req, res) => res.json(getLesson(String(req.params.id), true)));
  app.get('/api/teacher', (_req, res) =>
    res.json(parse(db.prepare('SELECT config FROM teacher WHERE id=1').get().config)),
  );
  app.get('/api/training', requireAuth, (req, res) => {
    // rowid resolves attempts made in the same millisecond in their insertion order.
    const rows = db
      .prepare(
        `
      SELECT e.*, r.title rule_title,
        (SELECT a.correct FROM answers a
          WHERE a.user_id=? AND a.exercise_id=e.id
          ORDER BY a.rowid DESC LIMIT 1) last_correct
      FROM exercises e JOIN rules r ON r.id=e.rule_id
      WHERE e.published=1 AND r.published=1 AND e.type NOT IN ('multiple','matching')
      ORDER BY r.title, e.id
    `,
      )
      .all(req.user!.id);
    res.json({
      exercises: rows.map((e) => ({
        ...mapExercise(e),
        ruleTitle: e.rule_title,
        needsReview: e.last_correct === 0,
      })),
    });
  });
  app.post('/api/exercises/:id/answer', requireAuth, (req, res) => {
    const b = body(req);
    const submitted = str(b.answer, 'Ответ', 1, 10000);
    const e = db
      .prepare(
        'SELECT e.*,r.title topic_title FROM exercises e JOIN rules r ON r.id=e.rule_id WHERE e.id=? AND e.published=1 AND r.published=1',
      )
      .get(req.params.id);
    if (!e) throw new HttpError(404, 'Задание не найдено.');
    const correct = safeAnswer(submitted, e.type) === safeAnswer(e.answer, e.type);
    let xpAwarded = 0;
    transaction(db, () => {
      const previous = db
        .prepare('SELECT id FROM answers WHERE user_id=? AND exercise_id=? AND correct=1 LIMIT 1')
        .get(req.user!.id, e.id);
      if (correct && !previous) xpAwarded = 5;
      db.prepare(
        'INSERT INTO answers(id,user_id,exercise_id,rule_id,prompt,topic_title,submitted,correct,expected,explanation,xp,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        id(),
        req.user!.id,
        e.id,
        e.rule_id,
        e.prompt,
        e.topic_title,
        submitted,
        +correct,
        e.answer,
        e.explanation,
        xpAwarded,
        iso(now()),
      );
      if (xpAwarded) db.prepare('UPDATE users SET xp=xp+? WHERE id=?').run(xpAwarded, req.user!.id);
    });
    res.json({ correct, answer: e.answer, explanation: e.explanation, xpAwarded });
  });
  app.post('/api/lessons/:id/complete', requireAuth, (req, res) => {
    const lesson = getLesson(String(req.params.id), true);
    const exercises = [
      ...new Set(
        lesson.blocks
          .filter((b: any) => ['exercise', 'check'].includes(b.type))
          .map((b: any) => b.exerciseId),
      ),
    ];
    for (const eid of exercises) {
      if (
        !db
          .prepare('SELECT id FROM answers WHERE user_id=? AND exercise_id=? AND correct=1')
          .get(req.user!.id, eid)
      )
        throw new HttpError(409, 'Сначала правильно выполните все задания урока.');
    }
    let xpAwarded = 0;
    transaction(db, () => {
      if (
        !db
          .prepare('SELECT lesson_id FROM lesson_completions WHERE user_id=? AND lesson_id=?')
          .get(req.user!.id, lesson.id)
      ) {
        xpAwarded = 20;
        db.prepare(
          'INSERT INTO lesson_completions(user_id,lesson_id,title,xp,created_at) VALUES(?,?,?,?,?)',
        ).run(req.user!.id, lesson.id, lesson.title, xpAwarded, iso(now()));
        db.prepare('UPDATE users SET xp=xp+? WHERE id=?').run(xpAwarded, req.user!.id);
      }
      db.prepare(
        'INSERT INTO progress(user_id,rule_id,learned,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id,rule_id) DO UPDATE SET learned=1,updated_at=excluded.updated_at',
      ).run(req.user!.id, lesson.ruleId, iso(now()));
    });
    res.json({ xpAwarded });
  });
  app.get('/api/progress', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM progress WHERE user_id=?').all(req.user!.id);
    const answers = db
      .prepare(
        'SELECT id,exercise_id exerciseId,rule_id ruleId,prompt,topic_title topicTitle,submitted,correct,expected,explanation,xp,created_at createdAt FROM answers WHERE user_id=? ORDER BY created_at DESC LIMIT 200',
      )
      .all(req.user!.id)
      .map((a) => ({ ...a, correct: !!a.correct }));
    res.json({
      favorites: rows.filter((r) => r.favorite).map((r) => r.rule_id),
      learned: rows.filter((r) => r.learned).map((r) => r.rule_id),
      answers,
      completedLessons: db
        .prepare('SELECT lesson_id FROM lesson_completions WHERE user_id=?')
        .all(req.user!.id)
        .map((r) => r.lesson_id),
    });
  });
  app.post('/api/progress/:ruleId', requireAuth, (req, res) => {
    const rid = String(req.params.ruleId);
    getRule(rid, true);
    const b = body(req),
      existing = db.prepare('SELECT * FROM progress WHERE user_id=? AND rule_id=?').get(req.user!.id, rid);
    const favorite = boolean(b.favorite, !!existing?.favorite),
      learned = boolean(b.learned, !!existing?.learned);
    db.prepare(
      'INSERT INTO progress(user_id,rule_id,favorite,learned,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,rule_id) DO UPDATE SET favorite=excluded.favorite,learned=excluded.learned,updated_at=excluded.updated_at',
    ).run(req.user!.id, rid, +favorite, +learned, iso(now()));
    res.json({ favorite, learned });
  });
  app.get('/api/admin/rules', edit, (_req, res) =>
    res.json(
      db
        .prepare(ruleQuery + ' ORDER BY r.created_at DESC')
        .all()
        .map(mapRule),
    ),
  );
  app.post('/api/admin/rules', edit, (req, res) => {
    const data = ruleData(body(req));
    let rid = '';
    transaction(db, () => {
      rid = insertRule(data);
      audit(req.user!.id, 'rule.create', rid);
    });
    broadcast();
    res.status(201).json(getRule(rid));
  });
  app.put('/api/admin/rules/:id', edit, (req, res) => {
    const rid = String(req.params.id);
    getRule(rid);
    const d = ruleData(body(req));
    transaction(db, () => {
      db.prepare(
        'UPDATE rules SET title=?,category_id=?,subcategory=?,summary=?,explanation=?,examples=?,mistakes=?,images=?,difficulty=?,games=?,published=?,updated_at=? WHERE id=?',
      ).run(
        d.title,
        d.categoryId,
        d.subcategory,
        d.summary,
        d.explanation,
        JSON.stringify(d.examples),
        JSON.stringify(d.mistakes),
        JSON.stringify(d.images),
        d.difficulty,
        JSON.stringify(d.games),
        +d.published,
        iso(now()),
        rid,
      );
      audit(req.user!.id, 'rule.update', rid);
    });
    broadcast();
    res.json(getRule(rid));
  });
  app.delete('/api/admin/rules/:id', edit, (req, res) => {
    const rid = String(req.params.id);
    getRule(rid);
    transaction(db, () => {
      db.prepare('DELETE FROM rules WHERE id=?').run(rid);
      audit(req.user!.id, 'rule.delete', rid);
    });
    broadcast();
    res.json({ ok: true });
  });
  app.get('/api/admin/exercises', edit, (_req, res) =>
    res.json(
      db
        .prepare('SELECT * FROM exercises ORDER BY created_at')
        .all()
        .map((r) => mapExercise(r, true)),
    ),
  );
  app.post('/api/admin/exercises', edit, (req, res) => {
    const d = exerciseData(body(req));
    let eid = '';
    transaction(db, () => {
      eid = insertExercise(d);
      audit(req.user!.id, 'exercise.create', eid);
    });
    broadcast();
    res.status(201).json(mapExercise(db.prepare('SELECT * FROM exercises WHERE id=?').get(eid), true));
  });
  app.put('/api/admin/exercises/:id', edit, (req, res) => {
    const eid = String(req.params.id),
      old = db.prepare('SELECT * FROM exercises WHERE id=?').get(eid);
    if (!old) throw new HttpError(404, 'Задание не найдено.');
    const d = exerciseData(body(req));
    transaction(db, () => {
      db.prepare(
        'UPDATE exercises SET rule_id=?,type=?,prompt=?,options=?,answer=?,explanation=?,difficulty=?,exam_number=?,published=?,updated_at=? WHERE id=?',
      ).run(
        d.ruleId,
        d.type,
        d.prompt,
        JSON.stringify(d.options),
        d.answer,
        d.explanation,
        d.difficulty,
        d.examNumber,
        +d.published,
        iso(now()),
        eid,
      );
      if (!d.published || old.rule_id !== d.ruleId)
        invalidateLessonsForExercise(eid, old.rule_id !== d.ruleId);
      audit(req.user!.id, 'exercise.update', eid);
    });
    broadcast();
    res.json(mapExercise(db.prepare('SELECT * FROM exercises WHERE id=?').get(eid), true));
  });
  app.delete('/api/admin/exercises/:id', edit, (req, res) => {
    const eid = String(req.params.id);
    if (!db.prepare('SELECT id FROM exercises WHERE id=?').get(eid))
      throw new HttpError(404, 'Задание не найдено.');
    transaction(db, () => {
      invalidateLessonsForExercise(eid, true);
      db.prepare('DELETE FROM exercises WHERE id=?').run(eid);
      audit(req.user!.id, 'exercise.delete', eid);
    });
    broadcast();
    res.json({ ok: true });
  });
  app.get('/api/admin/lessons', edit, (_req, res) =>
    res.json(db.prepare('SELECT * FROM lessons ORDER BY created_at').all().map(mapLesson)),
  );
  app.post('/api/admin/lessons', edit, (req, res) => {
    const d = lessonData(body(req)),
      lid = id(),
      time = iso(now());
    transaction(db, () => {
      db.prepare(
        'INSERT INTO lessons(id,rule_id,title,published,blocks,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      ).run(lid, d.ruleId, d.title, +d.published, JSON.stringify(d.blocks), time, time);
      audit(req.user!.id, 'lesson.create', lid);
    });
    broadcast();
    res.status(201).json(getLesson(lid));
  });
  app.put('/api/admin/lessons/:id', edit, (req, res) => {
    const lid = String(req.params.id);
    getLesson(lid);
    const d = lessonData(body(req));
    transaction(db, () => {
      db.prepare('UPDATE lessons SET rule_id=?,title=?,published=?,blocks=?,updated_at=? WHERE id=?').run(
        d.ruleId,
        d.title,
        +d.published,
        JSON.stringify(d.blocks),
        iso(now()),
        lid,
      );
      audit(req.user!.id, 'lesson.update', lid);
    });
    broadcast();
    res.json(getLesson(lid));
  });
  app.delete('/api/admin/lessons/:id', edit, (req, res) => {
    const lid = String(req.params.id);
    getLesson(lid);
    transaction(db, () => {
      db.prepare('DELETE FROM lessons WHERE id=?').run(lid);
      audit(req.user!.id, 'lesson.delete', lid);
    });
    broadcast();
    res.json({ ok: true });
  });
  app.get('/api/admin/categories', edit, (_req, res) =>
    res.json(db.prepare('SELECT * FROM categories ORDER BY name').all()),
  );
  app.post('/api/admin/categories', edit, (req, res) => {
    const name = str(body(req).name, 'Категория', 2, 100);
    if (db.prepare('SELECT id FROM categories WHERE name=?').get(name))
      throw new HttpError(409, 'Такая категория уже существует.');
    const cid = id();
    transaction(db, () => {
      db.prepare('INSERT INTO categories(id,name) VALUES(?,?)').run(cid, name);
      audit(req.user!.id, 'category.create', cid);
    });
    broadcast();
    res.status(201).json({ id: cid, name });
  });
  app.delete('/api/admin/categories/:id', edit, (req, res) => {
    const cid = String(req.params.id);
    if (db.prepare('SELECT id FROM rules WHERE category_id=?').get(cid))
      throw new HttpError(409, 'Сначала удалите или перенесите правила этой категории.');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(cid))
      throw new HttpError(404, 'Категория не найдена.');
    transaction(db, () => {
      db.prepare('DELETE FROM categories WHERE id=?').run(cid);
      audit(req.user!.id, 'category.delete', cid);
    });
    broadcast();
    res.json({ ok: true });
  });
  app.get('/api/admin/teacher', edit, (_req, res) =>
    res.json(parse(db.prepare('SELECT config FROM teacher WHERE id=1').get().config)),
  );
  app.put('/api/admin/teacher', edit, (req, res) => {
    const b = body(req),
      images: Record<string, string> = {},
      phrases: Record<string, string> = {};
    for (const emotion of emotions) images[emotion] = imagePath(b.images?.[emotion] || '');
    for (const key of ['intro', 'correct', 'incorrect', 'complete'])
      phrases[key] = str(b.phrases?.[key] ?? '', 'Реплика', 0, 1000);
    const config = { name: str(b.name, 'Имя учительницы', 2, 80), images, phrases };
    transaction(db, () => {
      db.prepare('UPDATE teacher SET config=? WHERE id=1').run(JSON.stringify(config));
      audit(req.user!.id, 'teacher.update', '1');
    });
    broadcast();
    res.json(config);
  });
  app.post('/api/admin/uploads', edit, async (req, res) => {
    const value = str(body(req).data, 'Изображение', 1, 3_000_000);
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/=]+)$/.exec(value);
    if (!match)
      throw new HttpError(400, 'Разрешены PNG, JPEG, WEBP и GIF. SVG и произвольные файлы запрещены.');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 2 * 1024 * 1024) throw new HttpError(413, 'Изображение должно быть не больше 2 МБ.');
    const filename = await ctx.saveImage(buffer, match[1]);
    audit(req.user!.id, 'upload.create', filename);
    res.status(201).json({ url: '/uploads/' + filename });
  });
  function validateImport(b: Record<string, any>) {
    const errors: string[] = [],
      rules: any[] = [],
      exercises: any[] = [];
    if (!Array.isArray(b.rules ?? []) || !Array.isArray(b.exercises ?? []))
      throw new HttpError(400, 'Правила и задания должны быть массивами.');
    if ((b.rules?.length || 0) + (b.exercises?.length || 0) > 500)
      throw new HttpError(400, 'Не более 500 записей за один импорт.');
    (b.rules ?? []).forEach((r: any, index: number) => {
      try {
        rules.push(ruleData(r));
      } catch (e) {
        errors.push(`Правило ${index + 1}: ${(e as Error).message}`);
      }
    });
    (b.exercises ?? []).forEach((e: any, index: number) => {
      try {
        exercises.push(exerciseData(e));
      } catch (err) {
        errors.push(`Задание ${index + 1}: ${(err as Error).message}`);
      }
    });
    return {
      valid: errors.length === 0,
      errors,
      counts: { rules: rules.length, exercises: exercises.length },
      rules,
      exercises,
    };
  }
  app.post('/api/admin/import/preview', edit, (req, res) => {
    const { valid, errors, counts } = validateImport(body(req));
    res.json({ valid, errors, counts });
  });
  app.post('/api/admin/import', edit, (req, res) => {
    const data = validateImport(body(req));
    if (!data.valid) throw new HttpError(400, data.errors.join('\n'));
    transaction(db, () => {
      data.rules.forEach((r) => insertRule(r));
      data.exercises.forEach((e) => insertExercise(e));
      audit(req.user!.id, 'content.import', 'batch', data.counts);
    });
    broadcast();
    res.status(201).json({ ok: true, counts: data.counts });
  });
  app.get('/api/admin/users', admin, (_req, res) =>
    res.json(
      db
        .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 1000')
        .all()
        .map((u) => ({
          ...publicUser(u),
          streak: userStreak(db, u.id, now()),
          publicId:
            db.prepare('SELECT public_id FROM rr_profiles WHERE user_id=?').get(u.id)?.public_id || null,
        })),
    ),
  );
  app.post('/api/admin/users/:id/streak', admin, (req, res) => {
    const uid = String(req.params.id),
      b = body(req);
    const count = integer(b.count, 'Количество дней', 0, 36500);
    const reason = str(b.reason ?? '', 'Причина', 0, 300);
    const command = str(b.commandId, 'Номер операции', 16, 100);
    const result = transaction(db, () => {
      const previous = db
        .prepare('SELECT * FROM rr_admin_streak_commands WHERE actor_id=? AND command_id=?')
        .get(req.user!.id, command);
      if (previous) {
        if (previous.target_id !== uid || previous.count !== count || previous.reason !== reason)
          throw new HttpError(409, 'Номер операции уже использован.');
        return JSON.parse(previous.result);
      }
      if (!db.prepare('SELECT id FROM users WHERE id=?').get(uid))
        throw new HttpError(404, 'Пользователь не найден.');
      const before = userStreak(db, uid, now()),
        day = streakDay(now());
      db.prepare(
        'INSERT INTO rr_streak_adjustments VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET day=excluded.day,count=excluded.count',
      ).run(uid, day, count);
      const result = { before, after: count, day };
      audit(req.user!.id, 'user.streak', uid, { ...result, reason, commandId: command });
      db.prepare('INSERT INTO rr_admin_streak_commands VALUES(?,?,?,?,?,?)').run(
        req.user!.id,
        command,
        uid,
        count,
        reason,
        JSON.stringify(result),
      );
      return result;
    });
    broadcast();
    res.json(result);
  });
  app.post('/api/admin/users/:id/xp', admin, (req, res) => {
    const uid = String(req.params.id),
      b = body(req);
    const delta = integer(b.delta, 'Изменение XP', -1000000, 1000000);
    if (!delta) throw new HttpError(400, 'Укажите ненулевое изменение XP.');
    const reason = str(b.reason ?? '', 'Причина', 0, 300);
    const command = str(b.commandId, 'Номер операции', 16, 100);
    const result = transaction(db, () => {
      const previous = db
        .prepare('SELECT * FROM rr_admin_xp_commands WHERE actor_id=? AND command_id=?')
        .get(req.user!.id, command);
      if (previous) {
        if (previous.target_id !== uid || previous.delta !== delta || previous.reason !== reason)
          throw new HttpError(409, 'Номер операции уже использован для другого изменения.');
        return JSON.parse(previous.result);
      }
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
      if (!user) throw new HttpError(404, 'Пользователь не найден.');
      const after = user.xp + delta;
      if (after < 0) throw new HttpError(409, 'Нельзя списать больше XP, чем есть у пользователя.');
      if (!Number.isSafeInteger(after) || after > 2147483647)
        throw new HttpError(409, 'Превышено допустимое количество XP.');
      db.prepare('UPDATE users SET xp=? WHERE id=?').run(after, uid);
      const result = { user: publicUser({ ...user, xp: after }), before: user.xp, after, delta };
      audit(req.user!.id, 'user.xp', uid, { before: user.xp, after, delta, reason, commandId: command });
      db.prepare('INSERT INTO rr_admin_xp_commands VALUES(?,?,?,?,?,?)').run(
        req.user!.id,
        command,
        uid,
        delta,
        reason,
        JSON.stringify(result),
      );
      return result;
    });
    broadcast();
    res.json(result);
  });
  app.patch('/api/admin/users/:id', admin, (req, res) => {
    const uid = String(req.params.id),
      role = body(req).role;
    if (!['admin', 'editor', 'moderator', 'player'].includes(role))
      throw new HttpError(400, 'Неизвестная роль.');
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    if (!user) throw new HttpError(404, 'Пользователь не найден.');
    if (
      user.role === 'admin' &&
      role !== 'admin' &&
      db.prepare("SELECT count(*) n FROM users WHERE role='admin'").get().n === 1
    )
      throw new HttpError(409, 'Нельзя лишить прав последнего администратора.');
    transaction(db, () => {
      db.prepare('UPDATE users SET role=? WHERE id=?').run(role, uid);
      audit(req.user!.id, 'user.role', uid, { from: user.role, to: role });
    });
    broadcast();
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(uid)));
  });
  app.get('/api/admin/audit', admin, (_req, res) =>
    res.json(
      db
        .prepare(
          "SELECT a.id,a.actor_id actorId,u.username actorName,a.action,a.target_id targetId,a.created_at createdAt,CASE WHEN a.action='user.xp' THEN a.details ELSE NULL END xpDetails,CASE WHEN a.action='user.streak' THEN a.details ELSE NULL END streakDetails FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 250",
        )
        .all(),
    ),
  );
  const count = (table: string, where = '') => db.prepare(`SELECT count(*) n FROM ${table} ${where}`).get().n;
  const exists = (table: string) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  app.get('/api/admin/stats', edit, (_req, res) =>
    res.json({
      users: count('users'),
      online: [...onlineUsers.values()].filter((t) => t > now() - 45000).length,
      rooms: exists('rooms') ? count('rooms') : 0,
      rules: count('rules'),
      exercises: count('exercises'),
      lessons: count('lessons'),
      games: exists('game_results')
        ? db.prepare('SELECT count(DISTINCT session_id) n FROM game_results').get().n
        : 0,
    }),
  );
  app.get('/api/leaderboard', requireAuth, (_req, res) =>
    res.json(
      db
        .prepare(
          'SELECT id,username,role,xp,avatar,created_at FROM users ORDER BY xp DESC,created_at LIMIT 100',
        )
        .all()
        .map((r) => {
          const u = publicUser(r);
          delete (u as any).email;
          return u;
        }),
    ),
  );
  app.patch('/api/profile', requireAuth, (req, res) => {
    const b = body(req),
      username = str(b.username, 'Имя', 2, 40);
    const avatar = b.avatar === undefined ? req.user!.avatar : str(b.avatar, 'Аватар', 1, 50);
    if (
      avatar !== req.user!.avatar &&
      !['🦊', '🐱', '🐻', '🐼', '🦉', '🐸', '🐺', '🐰', '⭐', '🎮', '👑', '🦋'].includes(avatar)
    )
      throw new HttpError(400, 'Выберите один из предложенных аватаров.');
    db.prepare('UPDATE users SET username=?,avatar=? WHERE id=?').run(username, avatar, req.user!.id);
    broadcast();
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id)) });
  });
  app.get('/api/profile', requireAuth, (req, res) => {
    const uid = req.user!.id;
    const gameRows = exists('game_results')
      ? db.prepare('SELECT * FROM game_results WHERE user_id=? ORDER BY created_at DESC').all(uid)
      : [];
    const completed = db.prepare('SELECT * FROM lesson_completions WHERE user_id=?').all(uid);
    const answerRows = db
      .prepare('SELECT * FROM answers WHERE user_id=? ORDER BY created_at DESC LIMIT 100')
      .all(uid);
    const stats = {
      games: gameRows.length,
      wins: gameRows.filter((g) => g.win).length,
      losses: gameRows.filter((g) => !g.win).length,
      lessons: completed.length,
    };
    const history = [
      ...gameRows.map((g) => ({
        id: g.session_id,
        type: 'game',
        title: 'Шпион: ' + g.topic_title,
        topicTitle: g.topic_title,
        correct: !!g.win,
        win: !!g.win,
        xp: g.xp,
        createdAt: g.created_at,
      })),
      ...completed.map((l) => ({
        id: l.lesson_id,
        type: 'lesson',
        title: l.title,
        xp: l.xp,
        createdAt: l.created_at,
      })),
      ...answerRows.map((a) => ({
        id: a.id,
        type: 'exercise',
        title: a.prompt,
        topicTitle: a.topic_title,
        correct: !!a.correct,
        xp: a.xp,
        createdAt: a.created_at,
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200);
    const achievements = [];
    if (stats.wins)
      achievements.push({
        id: 'first-win',
        title: 'Первая победа',
        description: 'Победите в «Шпионе».',
        icon: '🏆',
      });
    if (stats.lessons)
      achievements.push({
        id: 'first-lesson',
        title: 'Первое открытие',
        description: 'Пройдите интерактивный урок.',
        icon: '📖',
      });
    if (
      db.prepare('SELECT count(DISTINCT exercise_id) n FROM answers WHERE user_id=? AND correct=1').get(uid)
        .n >= 100
    )
      achievements.push({
        id: 'hundred',
        title: '100 правильных ответов',
        description: 'Решите 100 разных заданий.',
        icon: '💯',
      });
    res.json({
      user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(uid)),
      stats,
      history,
      achievements,
    });
  });
  return { audit };
}
