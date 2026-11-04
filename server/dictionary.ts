import type { Express, RequestHandler } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { body, HttpError, norm, str } from './core';
import { transaction, type DB } from './storage';
const entrySchema = z.object({
  word: z.string().trim().min(1).max(100),
  stress: z.string().trim().max(120).default(''),
  meaning: z.string().trim().min(1).max(6000),
  category: z.string().trim().min(1).max(100),
  forms: z.array(z.string().trim().min(1).max(150)).max(30).default([]),
  examples: z.array(z.string().trim().min(1).max(1000)).max(12).default([]),
});
const importSchema = z.object({
  source: z.string().trim().min(1).max(300),
  version: z.string().trim().min(1).max(80),
  entries: z.array(entrySchema).min(1).max(2000),
});
type Context = {
  db: DB;
  requireAuth: RequestHandler;
  requireRole: (...roles: any[]) => RequestHandler;
  now: () => number;
  broadcast: () => void;
};
export function registerDictionary(app: Express, ctx: Context) {
  const { db } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS rr_dictionary(id TEXT PRIMARY KEY,word TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE,category TEXT NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rr_dictionary_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,source TEXT NOT NULL,version TEXT NOT NULL);
    INSERT OR IGNORE INTO rr_dictionary_meta VALUES(1,0,'','');
    CREATE TABLE IF NOT EXISTS rr_dictionary_favorites(user_id TEXT NOT NULL REFERENCES users(id),entry_id TEXT NOT NULL REFERENCES rr_dictionary(id) ON DELETE CASCADE,PRIMARY KEY(user_id,entry_id));
    CREATE TABLE IF NOT EXISTS rr_dictionary_previews(user_id TEXT PRIMARY KEY REFERENCES users(id),token TEXT NOT NULL,hash TEXT NOT NULL,revision INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
  const meta = () => ({
    ...db.prepare('SELECT revision,source,version FROM rr_dictionary_meta WHERE id=1').get(),
    count: db.prepare('SELECT count(*) n FROM rr_dictionary').get().n,
  });
  app.get('/api/dictionary', ctx.requireAuth, (req, res) => {
    const q = norm(String(req.query.q || ''))
      .replace(/[\\%_]/g, '')
      .slice(0, 100);
    const category = String(req.query.category || '');
    const letter = norm(String(req.query.letter || '')).slice(0, 1);
    const page = Math.max(0, Math.min(100000, Number(req.query.page) || 0) | 0);
    const fav = req.query.favorites === 'true';
    const where = `WHERE (?='' OR normalized LIKE ?) AND (?='' OR category=?) AND (?='' OR normalized LIKE ?) AND (?=0 OR id IN (SELECT entry_id FROM rr_dictionary_favorites WHERE user_id=?))`;
    const params = [q, '%' + q + '%', category, category, letter, letter + '%', Number(fav), req.user!.id];
    const entries = db
      .prepare(`SELECT id,data FROM rr_dictionary ${where} ORDER BY normalized LIMIT 30 OFFSET ?`)
      .all(...params, page * 30)
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
    res.json({
      ...meta(),
      entries,
      total: db.prepare(`SELECT count(*) n FROM rr_dictionary ${where}`).get(...params).n,
      page,
      categories: db
        .prepare('SELECT DISTINCT category FROM rr_dictionary ORDER BY category')
        .all()
        .map((r) => r.category),
      favorites: db
        .prepare('SELECT entry_id FROM rr_dictionary_favorites WHERE user_id=?')
        .all(req.user!.id)
        .map((r) => r.entry_id),
    });
  });
  app.post('/api/dictionary/:id/favorite', ctx.requireAuth, (req, res) => {
    if (!db.prepare('SELECT 1 FROM rr_dictionary WHERE id=?').get(req.params.id))
      throw new HttpError(404, 'Слово не найдено.');
    if (typeof req.body?.favorite !== 'boolean') throw new HttpError(400, 'Укажите состояние избранного.');
    if (req.body.favorite)
      db.prepare('INSERT OR IGNORE INTO rr_dictionary_favorites VALUES(?,?)').run(
        req.user!.id,
        req.params.id,
      );
    else
      db.prepare('DELETE FROM rr_dictionary_favorites WHERE user_id=? AND entry_id=?').run(
        req.user!.id,
        req.params.id,
      );
    ctx.broadcast();
    res.json({ ok: true });
  });
  app.get('/api/dictionary/practice', ctx.requireAuth, (req, res) => {
    const entries = db
      .prepare(
        'SELECT id,data FROM rr_dictionary WHERE id IN (SELECT entry_id FROM rr_dictionary_favorites WHERE user_id=?) ORDER BY random() LIMIT 10',
      )
      .all(req.user!.id);
    res.json(
      entries.map((r) => ({
        id: r.id,
        word: JSON.parse(r.data).word,
        category: JSON.parse(r.data).category,
      })),
    );
  });
  app.post('/api/dictionary/:id/check', ctx.requireAuth, (req, res) => {
    const row = db.prepare('SELECT data FROM rr_dictionary WHERE id=?').get(req.params.id);
    if (!row) throw new HttpError(404, 'Слово не найдено.');
    const entry = JSON.parse(row.data);
    res.json({ ...entry, recalled: body(req).recalled === true });
  });
  app.post('/api/admin/dictionary/import', ctx.requireRole('admin', 'editor'), (req, res) => {
    const parsed = importSchema.safeParse(req.body?.dictionary);
    if (!parsed.success)
      throw new HttpError(
        400,
        'Нужен JSON: source, version, entries (1–2000 слов с word, meaning, category; необязательно stress, forms, examples).',
      );
    const data = parsed.data,
      keys = data.entries.map((e) => norm(e.word));
    if (new Set(keys).size !== keys.length)
      throw new HttpError(
        400,
        'Есть повторяющиеся слова, в том числе после приведения Ё/Е. Разделите значения одной записи.',
      );
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const revision = meta().revision;
    if (req.body.preview === true) {
      const token = randomUUID();
      db.prepare(
        'INSERT INTO rr_dictionary_previews VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,hash=excluded.hash,revision=excluded.revision,expires_at=excluded.expires_at',
      ).run(req.user!.id, token, hash, revision, ctx.now() + 15 * 60000);
      const updated = keys.filter((k) =>
        db.prepare('SELECT 1 FROM rr_dictionary WHERE normalized=?').get(k),
      ).length;
      return res.json({
        token,
        added: keys.length - updated,
        updated,
        source: data.source,
        version: data.version,
        sample: data.entries.slice(0, 3),
      });
    }
    transaction(db, () => {
      const preview = db.prepare('SELECT * FROM rr_dictionary_previews WHERE user_id=?').get(req.user!.id);
      if (
        !preview ||
        preview.token !== req.body.token ||
        preview.hash !== hash ||
        preview.revision !== revision ||
        preview.expires_at <= ctx.now()
      )
        throw new HttpError(409, 'Предпросмотр устарел. Проверьте файл ещё раз перед импортом.');
      for (const entry of data.entries) {
        const key = norm(entry.word);
        db.prepare(
          'INSERT INTO rr_dictionary VALUES(?,?,?,?,?) ON CONFLICT(normalized) DO UPDATE SET word=excluded.word,category=excluded.category,data=excluded.data',
        ).run(randomUUID(), entry.word, key, entry.category, JSON.stringify(entry));
      }
      db.prepare('UPDATE rr_dictionary_meta SET revision=revision+1,source=?,version=? WHERE id=1').run(
        data.source,
        data.version,
      );
      db.prepare('DELETE FROM rr_dictionary_previews WHERE user_id=?').run(req.user!.id);
      db.prepare('INSERT INTO audit_log VALUES(?,?,?,?,?,?)').run(
        randomUUID(),
        req.user!.id,
        'dictionary.import',
        null,
        JSON.stringify({ count: keys.length, source: data.source }),
        new Date(ctx.now()).toISOString(),
      );
    });
    ctx.broadcast();
    res.json(meta());
  });
  app.post('/api/feedback', ctx.requireAuth, (req, res) => {
    const b = body(req),
      category = str(b.category, 'Категория', 1, 40),
      text = str(b.text, 'Сообщение', 10, 3000);
    if (!['Ошибка', 'Предложение', 'Проблема со входом'].includes(category))
      throw new HttpError(400, 'Выберите категорию.');
    // A mailto link uses the user's own mail app; no promise of server-side delivery.
    const subject = `[SDVS] ${category}`;
    const message = `${text}\n\nИгрок: ${req.user!.username}\nСтраница: ${String(b.page || '').slice(0, 300)}`;
    res.json({
      mailto: `mailto:vbarsegan363@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    });
  });
}
