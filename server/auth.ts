import type { Express, Request, Response, RequestHandler } from 'express';
import { emailCodes, emailDelivery, type EmailDelivery } from './email-codes';
import { transaction } from './storage';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { DB } from './storage.js';
import { HttpError, body, id, iso, publicUser, str, type Role } from './core.js';

const derive = promisify(scrypt);
const cookieName = 'rr_session';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const actual = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function cookie(req: Request) {
  const item = (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + '='));
  return item?.slice(cookieName.length + 1) || '';
}
export const sessionHash = (req: Request) => hashToken(cookie(req));
function email(value: unknown) {
  const result = str(value, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Введите корректный email.');
  return result;
}

export function setupAuth(
  app: Express,
  db: DB,
  now: () => number,
  testMode: boolean,
  delivery: EmailDelivery | undefined = testMode ? undefined : emailDelivery(process.env),
) {
  const codes = emailCodes(db, now, delivery);
  const attempts = new Map<string, { count: number; until: number }>();
  const accountAttempts = new Map<string, { count: number; until: number }>();
  const authLimit: RequestHandler = (req, _res, next) => {
    if (testMode) return next();
    const key = req.ip || 'local';
    let current = attempts.get(key);
    if (!current || current.until < now()) {
      current = { count: 0, until: now() + 60_000 };
      attempts.set(key, current);
    }
    if (++current.count > 120)
      return next(new HttpError(429, 'Слишком много попыток входа. Подождите минуту.'));
    // A class may share one IP. Throttle repeated attempts for one email more strictly.
    const mail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    if (mail) {
      const accountKey = `${key}:${mail}`;
      let account = accountAttempts.get(accountKey);
      if (!account || account.until < now()) {
        account = { count: 0, until: now() + 60_000 };
        accountAttempts.set(accountKey, account);
      }
      if (++account.count > 12)
        return next(new HttpError(429, 'Слишком много попыток для этого email. Подождите минуту.'));
    }
    if (accountAttempts.size > 5000)
      for (const [k, v] of accountAttempts) if (v.until < now()) accountAttempts.delete(k);
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now()) attempts.delete(k);
    next();
  };
  const hydrate: RequestHandler = (req, _res, next) => {
    const token = cookie(req);
    if (token) {
      const row = db
        .prepare(
          'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
        )
        .get(hashToken(token), now());
      if (row) req.user = publicUser(row);
    }
    next();
  };
  app.use('/api', hydrate);
  const requireAuth: RequestHandler = (req, _res, next) =>
    req.user ? next() : next(new HttpError(401, 'Войдите в аккаунт.'));
  const requireRole =
    (...roles: Role[]): RequestHandler =>
    (req, _res, next) =>
      !req.user
        ? next(new HttpError(401, 'Войдите в аккаунт.'))
        : roles.includes(req.user.role)
          ? next()
          : next(new HttpError(403, 'Недостаточно прав.'));
  function createSession(req: Request, res: Response, userId: string) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(
      hashToken(token),
      userId,
      now() + 14 * 86400_000,
      iso(now()),
    );
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true' || req.secure,
      path: '/',
      maxAge: 14 * 86400_000,
    });
  }
  app.get('/api/auth/status', (_req, res) =>
    res.json({ emailCodesEnabled: codes.enabled, emailCodesRequired: codes.required, smsEnabled: false }),
  );
  app.post('/api/auth/email-code', authLimit, async (req, res) => {
    const b = body(req),
      mail = email(b.email);
    if (!['register', 'reset'].includes(b.purpose)) throw new HttpError(400, 'Неизвестный тип кода.');
    await codes.request(mail, b.purpose, req.ip || 'unknown');
    res.json({
      ok: true,
      message:
        'Если адрес подходит для выбранного действия, письмо отправлено. Проверьте почту и папку Спам.',
    });
  });
  app.post('/api/auth/reset-password', authLimit, async (req, res) => {
    const b = body(req),
      mail = email(b.email),
      password = str(b.password, 'Пароль', 10, 128);
    const verified = codes.check(mail, 'reset', b.code);
    const passwordHash = await hashPassword(password);
    transaction(db, () => {
      codes.take(mail, 'reset', verified.nonce);
      const user = db.prepare('SELECT id FROM users WHERE email=?').get(mail);
      if (!user) throw new HttpError(400, 'Код неверен или истёк.');
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user || null }));
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const b = body(req);
    const mail = email(b.email),
      username = str(b.username, 'Имя', 2, 40),
      password = str(b.password, 'Пароль', 10, 128);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(mail))
      throw new HttpError(409, 'Этот email уже зарегистрирован.');
    const verified = codes.required ? codes.check(mail, 'register', b.code) : null;
    const passwordHash = await hashPassword(password);
    const uid = id();
    try {
      transaction(db, () => {
        if (verified) codes.take(mail, 'register', verified.nonce);
        db.prepare('INSERT INTO users(id,email,username,password_hash,created_at) VALUES(?,?,?,?,?)').run(
          uid,
          mail,
          username,
          passwordHash,
          iso(now()),
        );
        if (verified) db.prepare('INSERT INTO rr_verified_emails VALUES(?,?)').run(uid, now());
      });
    } catch (err) {
      if (db.prepare('SELECT id FROM users WHERE email=?').get(mail))
        throw new HttpError(409, 'Этот email уже зарегистрирован.');
      throw err;
    }
    createSession(req, res, uid);
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(uid)) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const b = body(req);
    const mail = email(b.email),
      password = str(b.password, 'Пароль', 1, 128);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(mail);
    const fallback = 'scrypt:0123456789abcdef0123456789abcdef:' + Buffer.alloc(64).toString('hex');
    const valid = await checkPassword(password, user?.password_hash || fallback);
    if (!user || !valid) throw new HttpError(401, 'Неверный email или пароль.');
    createSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = cookie(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    res.clearCookie(cookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true' || req.secure,
    });
    res.json({ ok: true });
  });
  app.post('/api/admin/bootstrap', requireAuth, authLimit, (req, res) => {
    const configured = process.env.ADMIN_BOOTSTRAP_TOKEN || '';
    if (configured.length < 32)
      throw new HttpError(404, 'Назначьте администратора локальной командой npm run admin -- email.');
    if (db.prepare("SELECT id FROM users WHERE role='admin'").get())
      throw new HttpError(409, 'Администратор уже назначен.');
    const token = str(body(req).token, 'Токен', 1, 256);
    const a = Buffer.from(configured),
      b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, 'Неверный токен.');
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(req.user!.id);
    db.prepare('INSERT INTO audit_log(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)').run(
      id(),
      req.user!.id,
      'admin.bootstrap',
      req.user!.id,
      iso(now()),
    );
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user!.id)) });
  });
  return {
    requireAuth,
    requireRole,
    cleanup: () => db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now()),
  };
}
