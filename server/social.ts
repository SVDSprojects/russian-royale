import type { Express, RequestHandler } from 'express';
import type { DB } from './storage';
import { transaction } from './storage';
import { HttpError } from './core';
import { setupProfileDetails, birthdayValue } from './profile-style';
type Ctx = {
  db: DB;
  requireAuth: RequestHandler;
  broadcast: () => void;
  now: () => number;
  saveImage: (b: Buffer, format: string) => Promise<string>;
};
export function registerSocial(app: Express, ctx: Ctx) {
  const { db } = ctx;
  setupProfileDetails(db);
  db.exec(
    `CREATE TABLE IF NOT EXISTS rr_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),public_id TEXT NOT NULL UNIQUE,bio TEXT NOT NULL DEFAULT '');CREATE TABLE IF NOT EXISTS rr_friends(sender TEXT NOT NULL REFERENCES users(id),receiver TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted')),PRIMARY KEY(sender,receiver));CREATE TABLE IF NOT EXISTS rr_social_presence(user_id TEXT PRIMARY KEY REFERENCES users(id),game TEXT NOT NULL,room_id TEXT NOT NULL,last_seen INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS rr_daily_events(user_id TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(user_id,event_id));CREATE TABLE IF NOT EXISTS rr_daily(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,points INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day));`,
  );
  const teacher = db.prepare('SELECT config FROM teacher WHERE id=1').get();
  db.exec(
    'CREATE TABLE IF NOT EXISTS rr_room_presence(game TEXT NOT NULL,room_id TEXT NOT NULL,user_id TEXT NOT NULL,last_seen INTEGER NOT NULL,PRIMARY KEY(game,room_id,user_id));CREATE INDEX IF NOT EXISTS rr_room_presence_recent ON rr_room_presence(last_seen);',
  );
  db.prepare('DELETE FROM rr_room_presence WHERE last_seen<?').run(ctx.now() - 86400000);
  if (teacher) {
    const config = JSON.parse(teacher.config);
    if (['Мария Ивановна', 'Марья Ивановна'].includes(config.name)) {
      config.name = 'Белова Надежда Юрьевна';
      db.prepare('UPDATE teacher SET config=? WHERE id=1').run(JSON.stringify(config));
    }
  }
  const day = (t = ctx.now()) => new Date(t + 4 * 3600000).toISOString().slice(0, 10);
  function ensure() {
    transaction(db, () => {
      for (const u of db
        .prepare('SELECT id,email,username FROM users WHERE id NOT IN (SELECT user_id FROM rr_profiles)')
        .all()) {
        let id = u.email?.toLowerCase() === 'vbarsegan363@gmail.com' ? '000001' : '';
        if (!id) {
          do {
            id = String(111111 + (crypto.getRandomValues(new Uint32Array(1))[0] % 888889));
          } while (db.prepare('SELECT 1 FROM rr_profiles WHERE public_id=?').get(id));
        }
        db.prepare('INSERT INTO rr_profiles(user_id,public_id) VALUES(?,?)').run(u.id, id);
      }
      const owner = db.prepare("SELECT id FROM users WHERE lower(email)='vbarsegan363@gmail.com'").get();
      if (owner && !db.prepare("SELECT 1 FROM seed_metadata WHERE key='sdvs-founder-identity-v1'").get()) {
        db.prepare('UPDATE users SET username=? WHERE id=?').run('CEO"SDVS"', owner.id);
        db.prepare('UPDATE rr_profiles SET public_id=? WHERE user_id=?').run('000001', owner.id);
        db.prepare('INSERT INTO seed_metadata VALUES(?,?)').run(
          'sdvs-founder-identity-v1',
          new Date(ctx.now()).toISOString(),
        );
      }
      // This reserved ID follows the account email, never a mutable nickname.
      const hayk = db
        .prepare("SELECT id FROM users WHERE lower(trim(email))='hayksargsyan865@gmail.com'")
        .get();
      const holder = db.prepare("SELECT user_id FROM rr_profiles WHERE public_id='000007'").get();
      if (holder && holder.user_id !== hayk?.id) {
        let replacement: string;
        do {
          replacement = String(111111 + (crypto.getRandomValues(new Uint32Array(1))[0] % 888889));
        } while (db.prepare('SELECT 1 FROM rr_profiles WHERE public_id=?').get(replacement));
        db.prepare('UPDATE rr_profiles SET public_id=? WHERE user_id=?').run(replacement, holder.user_id);
      }
      if (hayk) db.prepare("UPDATE rr_profiles SET public_id='000007' WHERE user_id=?").run(hayk.id);
    });
  }
  ensure();
  function days(id: string) {
    return db.prepare('SELECT day,points FROM rr_daily WHERE user_id=? ORDER BY day').all(id) as {
      day: string;
      points: number;
    }[];
  }
  function streak(values: { day: string }[]) {
    const set = new Set(values.map((v) => v.day));
    let t = ctx.now(),
      n = 0;
    if (!set.has(day(t))) t -= 86400000;
    while (set.has(day(t))) {
      n++;
      t -= 86400000;
    }
    return n;
  }
  const profile = (id: string) => {
    const u = db
      .prepare(
        "SELECT u.id,u.username,u.avatar,u.xp,p.public_id AS publicId,p.bio,coalesce(d.birthday,'') birthday FROM users u JOIN rr_profiles p ON p.user_id=u.id LEFT JOIN rr_profile_details d ON d.user_id=u.id WHERE u.id=? OR p.public_id=?",
      )
      .get(id, id);
    if (!u) throw new HttpError(404, 'Профиль не найден.');
    const activity = days(u.id);
    return { ...u, activity, streak: streak(activity) };
  };
  const wrap =
    (f: (req: any, res: any) => unknown): RequestHandler =>
    async (req, res, next) => {
      try {
        await f(req, res);
      } catch (e) {
        next(e);
      }
    };
  app.use('/api', (req, res, next) => {
    const path = (req.originalUrl || '').split('?')[0];
    const view =
      path.match(/^\/api\/games\/([^/]+)\/rooms\/([^/]+)\/view$/) || path.match(/^\/api\/(rooms)\/([^/]+)$/);
    const activity =
      req.method === 'POST' &&
      /^\/api\/(games\/[^/]+\/rooms\/[^/]+\/(actions|start)|rooms\/[^/]+\/(start|vote|guess)|.*\/answer|.*\/complete)$/.test(
        path,
      );
    if (!activity && !(req.method === 'GET' && view)) return next();
    ctx.requireAuth(req, res, (err) => {
      if (err) return next(err);
      const original = res.json.bind(res);
      res.json = ((value: any) => {
        if ((res.statusCode || 200) < 300 && !value?.error) {
          if (
            activity &&
            req.body?.action?.type !== 'chat' &&
            (!req.body?.commandId ||
              db
                .prepare('INSERT OR IGNORE INTO rr_daily_events VALUES(?,?)')
                .run(req.user!.id, req.body.commandId).changes)
          )
            db.prepare(
              'INSERT INTO rr_daily VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET points=points+1',
            ).run(req.user!.id, day());
          if (view) {
            db.prepare(
              'INSERT INTO rr_social_presence VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET game=excluded.game,room_id=excluded.room_id,last_seen=excluded.last_seen',
            ).run(req.user!.id, view[1] === 'rooms' ? 'spy' : view[1], view[2], ctx.now());
            db.prepare(
              'INSERT INTO rr_room_presence VALUES(?,?,?,?) ON CONFLICT(game,room_id,user_id) DO UPDATE SET last_seen=excluded.last_seen',
            ).run(view[1] === 'rooms' ? 'spy' : view[1], view[2], req.user!.id, ctx.now());
          }
        }
        return original(value);
      }) as typeof res.json;
      next();
    });
  });
  app.use('/api/social', ctx.requireAuth);
  app.use('/api/social', (_req, _res, next) => {
    ensure();
    next();
  });
  // JsonRouter accepts one middleware handler per use call.
  app.get(
    '/api/social/me',
    ctx.requireAuth,
    wrap((req, res) => {
      ensure();
      const me = profile(req.user.id);
      const friends = db
        .prepare(
          'SELECT CASE WHEN sender=? THEN receiver ELSE sender END AS id,status,sender FROM rr_friends WHERE sender=? OR receiver=?',
        )
        .all(req.user.id, req.user.id, req.user.id)
        .map((r) => {
          const p = profile(r.id);
          const common = days(req.user.id).filter((d) =>
            p.activity.some((x: { day: string }) => x.day === d.day),
          );
          return { ...p, status: r.status, incoming: r.sender !== req.user.id, pairStreak: streak(common) };
        });
      res.json({ me, friends });
    }),
  );
  app.get(
    '/api/social/profile/:id',
    ctx.requireAuth,
    wrap((req, res) => {
      ensure();
      res.json(profile(req.params.id));
    }),
  );
  app.get(
    '/api/social/search',
    ctx.requireAuth,
    wrap((req, res) => {
      ensure();
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return res.json([]);
      res.json(
        db
          .prepare(
            'SELECT u.id,u.username,u.avatar,p.public_id AS publicId,p.bio FROM rr_profiles p JOIN users u ON u.id=p.user_id WHERE p.public_id=? OR u.username LIKE ? LIMIT 20',
          )
          .all(q, '%' + q.replace(/[%_]/g, '') + '%'),
      );
    }),
  );
  app.patch(
    '/api/social/me',
    ctx.requireAuth,
    wrap(async (req, res) => {
      ensure();
      const b = req.body || {};
      if (
        typeof b.username !== 'string' ||
        b.username.trim().length < 2 ||
        b.username.trim().length > 40 ||
        typeof b.bio !== 'string' ||
        b.bio.length > 500
      )
        throw new HttpError(400, 'Ник: 2–40 символов. Био: до 500 символов.');
      let avatar = req.user.avatar;
      const birthday = b.birthday === undefined ? undefined : birthdayValue(b.birthday, ctx.now());
      if (b.photo) {
        const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(b.photo);
        if (!match || b.photo.length > 2800000) throw new HttpError(400, 'Фото: PNG, JPEG или WEBP до 2 МБ.');
        avatar = '/uploads/' + (await ctx.saveImage(Buffer.from(match[2], 'base64'), match[1]));
      }
      transaction(db, () => {
        db.prepare('UPDATE users SET username=?,avatar=? WHERE id=?').run(
          b.username.trim(),
          avatar,
          req.user.id,
        );
        db.prepare('UPDATE rr_profiles SET bio=? WHERE user_id=?').run(b.bio, req.user.id);
        if (birthday !== undefined)
          db.prepare(
            'INSERT INTO rr_profile_details(user_id,birthday) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET birthday=excluded.birthday',
          ).run(req.user.id, birthday);
      });
      ctx.broadcast();
      res.json(profile(req.user.id));
    }),
  );
  app.post(
    '/api/social/friends/:id',
    ctx.requireAuth,
    wrap((req, res) => {
      ensure();
      const target = profile(req.params.id);
      if (target.id === req.user.id) throw new HttpError(400, 'Это ваш профиль.');
      const reverse = db
        .prepare('SELECT status FROM rr_friends WHERE sender=? AND receiver=?')
        .get(target.id, req.user.id);
      if (reverse?.status === 'pending')
        db.prepare("UPDATE rr_friends SET status='accepted' WHERE sender=? AND receiver=?").run(
          target.id,
          req.user.id,
        );
      else if (!reverse)
        db.prepare("INSERT OR IGNORE INTO rr_friends VALUES(?,?,'pending')").run(req.user.id, target.id);
      ctx.broadcast();
      res.json({ ok: true });
    }),
  );
  app.delete(
    '/api/social/friends/:id',
    ctx.requireAuth,
    wrap((req, res) => {
      const t = profile(req.params.id);
      db.prepare('DELETE FROM rr_friends WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)').run(
        req.user.id,
        t.id,
        t.id,
        req.user.id,
      );
      ctx.broadcast();
      res.json({ ok: true });
    }),
  );
  app.get(
    '/api/social/friends/:id/games',
    ctx.requireAuth,
    wrap((req, res) => {
      ensure();
      const t = profile(req.params.id);
      if (
        !db
          .prepare(
            "SELECT 1 FROM rr_friends WHERE status='accepted' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?))",
          )
          .get(req.user.id, t.id, t.id, req.user.id)
      )
        throw new HttpError(403, 'Сначала добавьте игрока в друзья.');
      const links: any[] = [];
      const presence = db
        .prepare('SELECT * FROM rr_social_presence WHERE user_id=? AND last_seen>?')
        .get(t.id, ctx.now() - 45000);
      if (presence) {
        const game = presence.game;
        const allowed = [
          'alias',
          'whoami',
          'impostor',
          'mafia',
          'bunker',
          'broken-text',
          'durak',
          'jeopardy',
          'roulette',
          'spy',
        ];
        if (allowed.includes(game)) {
          const table = game === 'spy' ? 'rooms' : 'rr_' + game.replace('-', '_') + '_rooms';
          const r = db
            .prepare('SELECT * FROM ' + table + ' WHERE id=? AND server_id=?')
            .get(presence.room_id, 'public-' + game);
          if (r) {
            const state = game === 'spy' ? r : JSON.parse(r.state || r.data);
            if (!['finished', 'cancelled'].includes(state.phase || state.state?.phase))
              links.push({ game, roomId: r.id, name: r.name, version: r.version });
          }
        }
      }
      res.json(links);
    }),
  );
}
