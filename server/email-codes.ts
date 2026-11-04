import { createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DB } from './storage';
import { HttpError } from './core';
export type EmailDelivery = {
  secret: string;
  send: (email: string, purpose: 'register' | 'reset', code: string) => Promise<void>;
};
export function emailDelivery(env: Record<string, string | undefined>): EmailDelivery | undefined {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM || !env.AUTH_CODE_SECRET || env.AUTH_CODE_SECRET.length < 32)
    return undefined;
  const key = env.BREVO_API_KEY,
    from = env.MAIL_FROM,
    secret = env.AUTH_CODE_SECRET;
  return {
    secret,
    send: async (email, purpose, code) => {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'api-key': key },
        body: JSON.stringify({
          sender: { email: from, name: 'Русский Royale' },
          to: [{ email }],
          subject:
            purpose === 'register'
              ? 'Код регистрации Русский Royale'
              : 'Восстановление доступа Русский Royale',
          textContent: `Ваш код: ${code}. Срок действия — 10 минут. Если вы не запрашивали код, проигнорируйте письмо. Не передавайте код другим людям.`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
        console.warn(
          'rr-mail',
          JSON.stringify({ event: 'rejected', status: response.status, code: detail.code || 'unknown' }),
        );
        throw new HttpError(
          502,
          'Не удалось отправить письмо. Попробуйте позже или обратитесь к администратору.',
        );
      }
      const receipt = (await response.json().catch(() => ({}))) as { messageId?: string };
      console.info('rr-mail', JSON.stringify({ event: 'accepted', messageId: receipt.messageId || null }));
      // Only provider event names and reasons are logged; codes and message bodies never are.
      if (receipt.messageId)
        try {
          const report = await fetch(
            'https://api.brevo.com/v3/smtp/statistics/events?limit=5&days=1&email=' +
              encodeURIComponent(email),
            { headers: { 'api-key': key }, signal: AbortSignal.timeout(5000) },
          );
          if (report.ok) {
            const body = (await report.json()) as { events?: { event?: string; reason?: string }[] };
            console.info(
              'rr-mail-events',
              JSON.stringify(body.events?.map((e) => ({ event: e.event, reason: e.reason })) || []),
            );
          }
        } catch {
          /* A reporting failure must not invalidate an accepted email. */
        }
    },
  };
}
export function emailCodes(db: DB, now: () => number, delivery?: EmailDelivery) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS rr_auth_policy(id INTEGER PRIMARY KEY CHECK(id=1),email_required INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS rr_email_codes(email TEXT NOT NULL,purpose TEXT NOT NULL,nonce TEXT NOT NULL,hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(email,purpose));CREATE TABLE IF NOT EXISTS rr_mail_limits(key TEXT PRIMARY KEY,start INTEGER NOT NULL,n INTEGER NOT NULL,last INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS rr_verified_emails(user_id TEXT PRIMARY KEY REFERENCES users(id),verified_at INTEGER NOT NULL);`,
  );
  if (delivery) db.prepare('INSERT OR REPLACE INTO rr_auth_policy VALUES(1,1)').run();
  const required = !!db.prepare('SELECT email_required FROM rr_auth_policy WHERE id=1').get()?.email_required;
  const digest = (email: string, purpose: string, nonce: string, code: string) =>
    createHmac('sha256', delivery!.secret).update([email, purpose, nonce, code].join(':')).digest('hex');
  function check(email: string, purpose: string, code: unknown) {
    if (!delivery) throw new HttpError(503, 'Отправка писем ещё не подключена.');
    const row = db.prepare('SELECT * FROM rr_email_codes WHERE email=? AND purpose=?').get(email, purpose);
    if (
      !row ||
      row.used ||
      row.expires <= now() ||
      row.attempts >= 5 ||
      typeof code !== 'string' ||
      !/^\d{6}$/.test(code)
    )
      throw new HttpError(400, 'Код неверен или истёк. Запросите новый.');
    db.prepare('UPDATE rr_email_codes SET attempts=attempts+1 WHERE email=? AND purpose=?').run(
      email,
      purpose,
    );
    if (
      !timingSafeEqual(
        Buffer.from(digest(email, purpose, row.nonce, code), 'hex'),
        Buffer.from(row.hash, 'hex'),
      )
    )
      throw new HttpError(400, 'Код неверен или истёк. Запросите новый.');
    return row;
  }
  function take(email: string, purpose: string, nonce: string) {
    const result = db
      .prepare(
        'UPDATE rr_email_codes SET used=1 WHERE email=? AND purpose=? AND nonce=? AND used=0 AND expires>? AND attempts<=5',
      )
      .run(email, purpose, nonce, now());
    if (!result.changes) throw new HttpError(400, 'Код уже использован или истёк.');
  }
  function limit(key: string, max: number, cooldown: number) {
    const t = now(),
      r = db.prepare('SELECT * FROM rr_mail_limits WHERE key=?').get(key);
    if (r && t - r.start < 3600000 && (r.n >= max || t - r.last < cooldown))
      throw new HttpError(429, 'Слишком много запросов. Подождите перед повторной отправкой.');
    db.prepare(
      'INSERT INTO rr_mail_limits VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET start=CASE WHEN ?-start>=3600000 THEN ? ELSE start END,n=CASE WHEN ?-start>=3600000 THEN 1 ELSE n+1 END,last=?',
    ).run(key, t, t, t, t, t, t);
  }
  async function request(email: string, purpose: 'register' | 'reset', ip: string) {
    if (!delivery) throw new HttpError(503, 'Администратор ещё не подключил почтовую отправку.');
    limit('ip:' + ip, 30, 1000);
    limit('email:' + email, 6, 60000);
    const exists = !!db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (purpose === 'register' && exists)
      throw new HttpError(
        409,
        'Этот адрес уже зарегистрирован. Перейдите во «Вход» или нажмите «Забыли пароль?».',
      );
    if (purpose === 'reset' && !exists) return;
    const nonce = randomBytes(24).toString('hex'),
      code = String(randomInt(100000, 1000000));
    db.prepare(
      'INSERT INTO rr_email_codes VALUES(?,?,?,?,?,0,0) ON CONFLICT(email,purpose) DO UPDATE SET nonce=excluded.nonce,hash=excluded.hash,expires=excluded.expires,attempts=0,used=0',
    ).run(email, purpose, nonce, digest(email, purpose, nonce, code), now() + 600000);
    try {
      await delivery.send(email, purpose, code);
    } catch (error) {
      db.prepare('DELETE FROM rr_email_codes WHERE email=? AND purpose=? AND nonce=?').run(
        email,
        purpose,
        nonce,
      );
      throw error;
    }
    db.prepare('DELETE FROM rr_email_codes WHERE expires<?').run(now() - 86400000);
    db.prepare('DELETE FROM rr_mail_limits WHERE last<?').run(now() - 86400000);
  }
  return { enabled: !!delivery, required, check, take, request };
}
