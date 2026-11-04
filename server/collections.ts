import type { Express, RequestHandler } from 'express';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { body, HttpError, str, verification } from './core';
import { transaction, type DB } from './storage';
import { cases, gifts, premiumPrice, profileEmojis } from '../shared/collection';
import { getProfileStyle, validateStyle, saveStyle } from './profile-style';

type Context = { db: DB; requireAuth: RequestHandler; now: () => number; broadcast: () => void };
export function registerCollections(app: Express, ctx: Context) {
  const { db } = ctx;
  db.exec(`
    CREATE TABLE IF NOT EXISTS rr_shop_profile(user_id TEXT PRIMARY KEY REFERENCES users(id),premium_until INTEGER NOT NULL DEFAULT 0,emoji TEXT NOT NULL DEFAULT '',featured TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS rr_inventory(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('gift','id')),reward TEXT NOT NULL,serial INTEGER NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS rr_inventory_owner ON rr_inventory(owner_id,created_at);
    CREATE TABLE IF NOT EXISTS rr_special_ids(public_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS rr_shop_commands(user_id TEXT NOT NULL REFERENCES users(id),command_id TEXT NOT NULL,payload_hash TEXT NOT NULL,result TEXT NOT NULL,spent INTEGER NOT NULL CHECK(spent>=0),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,command_id));
  `);
  const balance = (uid: string) => {
    const earned = db.prepare('SELECT xp FROM users WHERE id=?').get(uid)?.xp ?? 0;
    const spent = db
      .prepare('SELECT coalesce(sum(spent),0) n FROM rr_shop_commands WHERE user_id=?')
      .get(uid).n;
    return { earned, spent, available: Math.max(0, earned - spent) };
  };
  const inventory = (uid: string) =>
    db
      .prepare(
        'SELECT id,kind,reward,serial,created_at AS createdAt FROM rr_inventory WHERE owner_id=? ORDER BY created_at DESC,id',
      )
      .all(uid);
  function appearance(uid: string) {
    const row = db
      .prepare('SELECT premium_until,emoji,featured FROM rr_shop_profile WHERE user_id=?')
      .get(uid);
    const premium = (row?.premium_until ?? 0) > ctx.now();
    const featured = (JSON.parse(row?.featured || '[]') as string[])
      .slice(0, premium ? 6 : 1)
      .flatMap((id) => {
        const item = db
          .prepare(
            "SELECT id,kind,reward,serial,created_at AS createdAt FROM rr_inventory WHERE id=? AND owner_id=? AND kind='gift'",
          )
          .get(id, uid);
        return item ? [item] : [];
      });
    const style = getProfileStyle(db, uid);
    const statusGift = style.statusGiftId
      ? (db
          .prepare(
            "SELECT id,kind,reward,serial,created_at AS createdAt FROM rr_inventory WHERE id=? AND owner_id=? AND kind='gift'",
          )
          .get(style.statusGiftId, uid) ?? null)
      : null;
    return {
      premium,
      premiumUntil: row?.premium_until ?? 0,
      emoji: premium ? row.emoji : '',
      featured,
      style,
      statusGift,
    };
  }
  app.get('/api/identities', ctx.requireAuth, (req, res) => {
    const users = db
      .prepare(
        `SELECT id,username,email,role FROM users WHERE lower(email)='vbarsegan363@gmail.com' OR role IN ('admin','editor','moderator') OR id IN (SELECT user_id FROM rr_shop_profile) OR id=?`,
      )
      .all(req.user!.id);
    res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        ...verification(u),
        ...appearance(u.id),
      })),
    );
  });
  app.get('/api/collection', ctx.requireAuth, (req, res) =>
    res.json({
      balance: balance(req.user!.id),
      inventory: inventory(req.user!.id),
      appearance: appearance(req.user!.id),
      gifts,
      cases,
      premiumPrice,
      emojis: profileEmojis,
    }),
  );
  app.get('/api/collection/profile/:id', ctx.requireAuth, (req, res) => {
    const u = db
      .prepare(
        'SELECT u.id,u.email,u.role FROM users u JOIN rr_profiles p ON p.user_id=u.id WHERE u.id=? OR p.public_id=?',
      )
      .get(req.params.id, req.params.id);
    if (!u) throw new HttpError(404, 'Профиль не найден.');
    res.json({ ...verification(u), ...appearance(u.id) });
  });
  app.post('/api/collection/purchase', ctx.requireAuth, (req, res) => {
    const b = body(req),
      uid = req.user!.id;
    const command = str(b.commandId, 'Номер операции', 16, 100);
    const key = str(b.product, 'Покупка', 1, 30);
    const offer = cases.find((c) => c.key === key);
    if (!offer && key !== 'premium') throw new HttpError(400, 'Такого предложения нет.');
    const hash = createHash('sha256').update(key).digest('hex');
    const result = transaction(db, () => {
      const previous = db
        .prepare('SELECT payload_hash,result FROM rr_shop_commands WHERE user_id=? AND command_id=?')
        .get(uid, command);
      if (previous) {
        if (previous.payload_hash !== hash)
          throw new HttpError(409, 'Этот номер операции уже использован для другой покупки.');
        return JSON.parse(previous.result);
      }
      const price = offer?.price ?? premiumPrice;
      if (balance(uid).available < price)
        throw new HttpError(409, 'Недостаточно доступного XP. Продолжай учиться и играть.');
      let reward: any;
      if (key === 'premium') {
        const until =
          db.prepare('SELECT premium_until FROM rr_shop_profile WHERE user_id=?').get(uid)?.premium_until ||
          0;
        const premiumUntil = Math.max(until, ctx.now()) + 30 * 86400000;
        db.prepare(
          'INSERT INTO rr_shop_profile(user_id,premium_until) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET premium_until=excluded.premium_until',
        ).run(uid, premiumUntil);
        reward = { kind: 'premium', premiumUntil };
      } else {
        let itemKey: string,
          kind: 'gift' | 'id' = 'gift';
        if (key === 'identity') {
          kind = 'id';
          itemKey = '';
          for (let attempt = 0; attempt < 100; attempt++) {
            const candidate = String(randomInt(10000, 111111)).padStart(6, '0');
            if (
              !db.prepare('SELECT 1 FROM rr_profiles WHERE public_id=?').get(candidate) &&
              !db.prepare('SELECT 1 FROM rr_special_ids WHERE public_id=?').get(candidate)
            ) {
              itemKey = candidate;
              break;
            }
          }
          if (!itemKey) throw new HttpError(409, 'Сейчас нет свободного номера. XP не списан.');
          db.prepare('INSERT INTO rr_special_ids VALUES(?,?)').run(itemKey, uid);
        } else {
          const roll = randomInt(100),
            odds = offer!.odds!;
          const rarity =
            roll < odds.common ? 'common' : roll < odds.common + odds.rare ? 'rare' : 'legendary';
          const pool = gifts.filter((g) => g.rarity === rarity);
          itemKey = pool[randomInt(pool.length)].key;
        }
        const serial = db
          .prepare('SELECT coalesce(max(serial),0)+1 n FROM rr_inventory WHERE kind=? AND reward=?')
          .get(kind, itemKey).n;
        const itemId = randomUUID();
        db.prepare('INSERT INTO rr_inventory VALUES(?,?,?,?,?,?)').run(
          itemId,
          uid,
          kind,
          itemKey,
          serial,
          ctx.now(),
        );
        reward = { id: itemId, kind, reward: itemKey, serial, createdAt: ctx.now() };
      }
      const receipt = { reward, price, commandId: command };
      db.prepare('INSERT INTO rr_shop_commands VALUES(?,?,?,?,?,?)').run(
        uid,
        command,
        hash,
        JSON.stringify(receipt),
        price,
        ctx.now(),
      );
      return receipt;
    });
    ctx.broadcast();
    res.json({ ...result, balance: balance(uid) });
  });
  app.patch('/api/collection/appearance', ctx.requireAuth, (req, res) => {
    const b = body(req),
      uid = req.user!.id;
    transaction(db, () => {
      const premium = appearance(uid).premium;
      if (
        typeof b.emoji !== 'string' ||
        (b.emoji !== '' && (!premium || !profileEmojis.includes(b.emoji as any)))
      )
        throw new HttpError(400, 'Этот фон доступен с премиумом.');
      if (
        !Array.isArray(b.featured) ||
        b.featured.length > (premium ? 6 : 1) ||
        new Set(b.featured).size !== b.featured.length ||
        b.featured.some(
          (id: unknown) =>
            typeof id !== 'string' ||
            !db.prepare("SELECT 1 FROM rr_inventory WHERE id=? AND owner_id=? AND kind='gift'").get(id, uid),
        )
      )
        throw new HttpError(400, 'Выберите свои подарки: один без премиума или до шести с премиумом.');
      if (b.style !== undefined) saveStyle(db, uid, validateStyle(b.style, db, uid));
      db.prepare(
        'INSERT INTO rr_shop_profile(user_id,emoji,featured) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET emoji=excluded.emoji,featured=excluded.featured',
      ).run(uid, b.emoji, JSON.stringify(b.featured));
    });
    ctx.broadcast();
    res.json(appearance(uid));
  });
  app.post('/api/collection/ids/:id/apply', ctx.requireAuth, (req, res) => {
    transaction(db, () => {
      const uid = req.user!.id,
        current = db.prepare('SELECT public_id FROM rr_profiles WHERE user_id=?').get(uid);
      if (!current) throw new HttpError(409, 'Сначала откройте свой профиль.');
      if (['000001', '000007'].includes(current.public_id))
        throw new HttpError(409, 'Ваш специальный номер закреплён за аккаунтом.');
      if (
        !db.prepare('SELECT 1 FROM rr_special_ids WHERE public_id=? AND owner_id=?').get(req.params.id, uid)
      )
        throw new HttpError(403, 'Этот номер не принадлежит вам.');
      const occupied = db.prepare('SELECT user_id FROM rr_profiles WHERE public_id=?').get(req.params.id);
      if (occupied && occupied.user_id !== uid) throw new HttpError(409, 'Номер уже используется.');
      db.prepare('UPDATE rr_profiles SET public_id=? WHERE user_id=?').run(req.params.id, uid);
    });
    ctx.broadcast();
    res.json({ ok: true, publicId: req.params.id });
  });
  app.post('/api/collection/gifts/:id/send', ctx.requireAuth, (req, res) => {
    transaction(db, () => {
      const uid = req.user!.id,
        target = str(body(req).targetId, 'Получатель', 1, 100);
      const recipient = db
        .prepare('SELECT user_id FROM rr_profiles WHERE public_id=? OR user_id=?')
        .get(target, target);
      if (!recipient || recipient.user_id === uid)
        throw new HttpError(400, 'Выберите другого игрока из друзей.');
      if (
        !db
          .prepare(
            "SELECT 1 FROM rr_friends WHERE status='accepted' AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?))",
          )
          .get(uid, recipient.user_id, recipient.user_id, uid)
      )
        throw new HttpError(403, 'Подарки можно отправлять друзьям.');
      const moved = db
        .prepare("UPDATE rr_inventory SET owner_id=? WHERE id=? AND owner_id=? AND kind='gift'")
        .run(recipient.user_id, req.params.id, uid);
      if (!moved.changes) throw new HttpError(409, 'Подарок уже передан или не принадлежит вам.');
      const style = getProfileStyle(db, uid);
      if (style.statusGiftId === req.params.id) saveStyle(db, uid, { ...style, statusGiftId: '' });
      const row = db.prepare('SELECT featured FROM rr_shop_profile WHERE user_id=?').get(uid);
      if (row)
        db.prepare('UPDATE rr_shop_profile SET featured=? WHERE user_id=?').run(
          JSON.stringify(JSON.parse(row.featured).filter((id: string) => id !== req.params.id)),
          uid,
        );
    });
    ctx.broadcast();
    res.json({ ok: true });
  });
}
