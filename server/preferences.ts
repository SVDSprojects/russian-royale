import type { Express, RequestHandler } from 'express';
import type { DB } from './storage';
import { HttpError } from './core';
type Context = { db: DB; requireAuth: RequestHandler; now: () => number; broadcast: () => void };
export function registerPreferences(app: Express, ctx: Context) {
  const { db } = ctx;
  db.exec(
    `CREATE TABLE IF NOT EXISTS rr_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),theme TEXT NOT NULL DEFAULT 'system',notifications INTEGER NOT NULL DEFAULT 1);CREATE TABLE IF NOT EXISTS rr_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,link TEXT NOT NULL,created_at INTEGER NOT NULL,read_at INTEGER,event_key TEXT NOT NULL UNIQUE);CREATE INDEX IF NOT EXISTS rr_notifications_user ON rr_notifications(user_id,created_at);`,
  );
  const read = (id: string) => {
    const p = db.prepare('SELECT theme,notifications FROM rr_preferences WHERE user_id=?').get(id);
    return { theme: p?.theme || 'system', notifications: p ? !!p.notifications : true };
  };
  const notify = (id: string, title: string, body: string, link: string, key: string) => {
    if (!read(id).notifications) return;
    db.prepare('INSERT OR IGNORE INTO rr_notifications VALUES(?,?,?,?,?,?,NULL,?)').run(
      crypto.randomUUID(),
      id,
      title,
      body,
      link,
      ctx.now(),
      id + ':' + key,
    );
    db.prepare(
      'DELETE FROM rr_notifications WHERE user_id=? AND id NOT IN (SELECT id FROM rr_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100)',
    ).run(id, id);
  };
  app.get('/api/preferences', ctx.requireAuth, (req, res) => res.json(read(req.user!.id)));
  app.patch('/api/preferences', ctx.requireAuth, (req, res, next) => {
    const b = req.body;
    if (!b || !['light', 'dark', 'system'].includes(b.theme) || typeof b.notifications !== 'boolean')
      return next(new HttpError(400, 'Некорректные настройки.'));
    db.prepare(
      'INSERT INTO rr_preferences VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,notifications=excluded.notifications',
    ).run(req.user!.id, b.theme, Number(b.notifications));
    ctx.broadcast();
    res.json(read(req.user!.id));
  });
  app.get('/api/notifications', ctx.requireAuth, (req, res) =>
    res.json({
      notifications: db
        .prepare(
          'SELECT id,title,body,link,created_at AS createdAt,read_at AS readAt FROM rr_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
        )
        .all(req.user!.id),
    }),
  );
  app.post('/api/notifications/read', ctx.requireAuth, (req, res) => {
    if (req.body?.id)
      db.prepare('UPDATE rr_notifications SET read_at=? WHERE id=? AND user_id=?').run(
        ctx.now(),
        req.body.id,
        req.user!.id,
      );
    else
      db.prepare('UPDATE rr_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(
        ctx.now(),
        req.user!.id,
      );
    ctx.broadcast();
    res.json({ ok: true });
  });
  app.use('/api', (req, res, next) => {
    const path = (req.originalUrl || '').split('?')[0];
    if (req.method !== 'POST' || !req.user) return next();
    const friend = path.match(/^\/api\/social\/friends\/([^/]+)$/),
      start = path.match(/^\/api\/(?:games\/([^/]+)\/)?rooms\/([^/]+)\/start$/);
    if (!friend && !start) return next();
    const original = res.json.bind(res);
    res.json = ((value: any) => {
      if ((res.statusCode || 200) < 300 && !value?.error) {
        if (friend) {
          const target = db
            .prepare('SELECT user_id FROM rr_profiles WHERE public_id=? OR user_id=?')
            .get(friend[1], friend[1]);
          if (target) {
            const accepted = db
              .prepare(
                "SELECT 1 FROM rr_friends WHERE status='accepted' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?))",
              )
              .get(req.user!.id, target.user_id, target.user_id, req.user!.id);
            notify(
              target.user_id,
              accepted ? 'Заявка принята' : 'Заявка в друзья',
              req.user!.username + (accepted ? ' принял дружбу' : ' хочет добавить вас в друзья'),
              'friends',
              (accepted ? 'accepted:' : 'request:') + [req.user!.id, target.user_id].sort().join(':'),
            );
          }
        }
        if (start) {
          const view = value.view || value;
          const players = view.players || view.participants || view.members || [];
          const session = view.sessionId || start[2];
          for (const p of players) {
            const id = p.id || p.userId;
            if (id && id !== req.user!.id)
              notify(
                id,
                'Игра началась',
                req.user!.username + ' запустил партию',
                start[1] ? 'games/' + start[1] + '/' + start[2] : 'rooms/' + start[2],
                'start:' + session,
              );
          }
        }
      }
      return original(value);
    }) as typeof res.json;
    next();
  });
  app.post('/api/notifications/invite/:id', ctx.requireAuth, (req, res, next) => {
    const other = db
      .prepare('SELECT user_id FROM rr_profiles WHERE public_id=? OR user_id=?')
      .get(req.params.id, req.params.id)?.user_id;
    if (
      !other ||
      !db
        .prepare(
          "SELECT 1 FROM rr_friends WHERE status='accepted' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?))",
        )
        .get(req.user!.id, other, other, req.user!.id)
    )
      return next(new HttpError(403, 'Пригласить можно только друга.'));
    const presence = db
      .prepare('SELECT * FROM rr_social_presence WHERE user_id=? AND last_seen>?')
      .get(req.user!.id, ctx.now() - 45000);
    if (!presence) return next(new HttpError(400, 'Сначала откройте игровую комнату.'));
    notify(
      other,
      'Друг зовёт играть',
      req.user!.username + ' приглашает вас в комнату',
      presence.game === 'spy'
        ? 'rooms/' + presence.room_id
        : 'games/' + presence.game + '/' + presence.room_id,
      'invite:' + req.user!.id + ':' + presence.room_id + ':' + Math.floor(ctx.now() / 60000),
    );
    ctx.broadcast();
    res.json({ ok: true });
  });
}
