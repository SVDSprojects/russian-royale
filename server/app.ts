import { registerSocial } from './social';
import { registerPublicServers } from './public-servers';
import { saveLocalImage } from './local-images.js';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createDatabase, migrateMultiplayer } from './db.js';
import { seed } from './seed.js';
import { setupAuth, sessionHash } from './auth.js';
import { setupContent } from './content.js';
import { registerExtraGames } from './games/register';
import { registerWaitingGames } from './waiting-games';
import { registerGameRoutes } from './game.js';
import { HttpError } from './core.js';

export function createApp(
  options: { dbPath?: string; testMode?: boolean; now?: () => number; uploadsDir?: string } = {},
) {
  const now = options.now || Date.now;
  const dbPath = options.dbPath || process.env.DATABASE_PATH || resolve('data/royale.sqlite');
  const uploadsDir =
    options.uploadsDir ||
    process.env.UPLOADS_DIR ||
    resolve(dbPath === ':memory:' ? 'data/test-uploads' : dirname(dbPath), 'uploads');
  const db = createDatabase(dbPath);
  seed(db);
  migrateMultiplayer(db);
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const onlineUsers = new Map<string, number>();
  const clients = new Map<Response, { userId: string; sessionHash: string }>();
  const epoch = randomUUID();
  let revision = 0;
  const version = () => `${epoch}:${revision}`;
  const pendingPolls = new Set<() => void>();
  const broadcast = () => {
    revision++;
    bus.emit('update');
    for (const res of clients.keys()) {
      if (!res.destroyed) res.write('event: update\ndata: {}\n\n');
    }
  };
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production')
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin'),
        allowed = (process.env.PUBLIC_ORIGIN || '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
      const ownOrigin = `${req.protocol}://${req.get('host')}`;
      if (origin && origin !== ownOrigin && !allowed.includes(origin))
        return next(new HttpError(403, 'Запрос с другого сайта запрещён.'));
      if (req.get('sec-fetch-site') === 'cross-site' && (!origin || !allowed.includes(origin)))
        return next(new HttpError(403, 'Запрос с другого сайта запрещён.'));
    }
    next();
  });
  app.use(express.json({ limit: '4mb' }));
  const requests = new Map<string, { count: number; until: number }>();
  app.use('/api', (req, _res, next) => {
    if (options.testMode) return next();
    const key = req.ip || 'local';
    let value = requests.get(key);
    if (!value || value.until < now()) {
      value = { count: 0, until: now() + 60000 };
      requests.set(key, value);
    }
    if (++value.count > 3000) return next(new HttpError(429, 'Слишком много запросов. Подождите минуту.'));
    next();
  });
  const auth = setupAuth(app, db, now, !!options.testMode);
  app.use('/api', (req, _res, next) => {
    if (req.user) onlineUsers.set(req.user.id, now());
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, serverNow: now() }));
  app.get('/api/events', auth.requireAuth, (req, res) => {
    if ([...clients.values()].filter((v) => v.userId === req.user!.id).length >= 8)
      throw new HttpError(429, 'Слишком много открытых подключений. Закройте лишние вкладки.');
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    clients.set(res, { userId: req.user!.id, sessionHash: sessionHash(req) });
    onlineUsers.set(req.user!.id, now());
    res.write('retry: 2000\nevent: update\ndata: {}\n\n');
    req.on('close', () => clients.delete(res));
  });
  // JSON long polling works through proxies which buffer or reject SSE.
  // Like SSE, it contains no room data or secret roles.
  app.get('/api/updates', auth.requireAuth, (req, res) => {
    const tokenHash = sessionHash(req);
    if (req.query.after !== version()) {
      res.json({ version: version(), serverNow: now() });
      return;
    }
    let done = false;
    const cleanup = () => {
      clearTimeout(timer);
      bus.off('update', respond);
      pendingPolls.delete(respond);
    };
    const respond = () => {
      if (done) return;
      done = true;
      cleanup();
      if (res.destroyed) return;
      if (!db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(tokenHash, now())) {
        res.status(401).json({ error: 'Войдите в аккаунт.' });
        return;
      }
      res.json({ version: version(), serverNow: now() });
    };
    const timer = setTimeout(respond, 20000);
    timer.unref();
    bus.once('update', respond);
    pendingPolls.add(respond);
    res.on('close', () => {
      done = true;
      cleanup();
    });
  });
  mkdirSync(uploadsDir, { recursive: true });
  app.use(
    '/uploads',
    express.static(uploadsDir, { dotfiles: 'deny', index: false, fallthrough: false, maxAge: '1d' }),
  );
  const ctx = {
    db,
    requireAuth: auth.requireAuth,
    requireRole: auth.requireRole,
    broadcast,
    now,
    onlineUsers,
    uploadsDir,
    saveImage: (buffer: Buffer) => saveLocalImage(buffer, uploadsDir),
  };
  registerSocial(app, ctx);
  registerPublicServers(app, ctx);
  const game = registerGameRoutes(app, ctx);
  const extraGames = registerExtraGames(app, ctx);
  registerWaitingGames(app, ctx);
  setupContent(app, ctx);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API-метод не найден.')));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.get('/admin', (_req, res) => res.redirect('/admin.html'));
    app.use(
      express.static(dist, {
        index: false,
        fallthrough: true,
        maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next(new HttpError(404, 'Страница не найдена.'));
      res.sendFile(resolve(dist, 'index.html'));
    });
  }
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      error instanceof HttpError
        ? error.status
        : error.type === 'entity.too.large'
          ? 413
          : error instanceof SyntaxError
            ? 400
            : error.status === 404
              ? 404
              : 500;
    if (status === 500 && !options.testMode) console.error('API error:', error);
    if (!res.headersSent)
      res.status(status).json({
        error:
          status === 413
            ? 'Запрос слишком большой.'
            : status === 500
              ? 'Ошибка сервера. Попробуйте ещё раз.'
              : error instanceof SyntaxError
                ? 'Неверный JSON.'
                : error instanceof HttpError
                  ? error.message
                  : status === 404
                    ? 'Ресурс не найден.'
                    : 'Запрос отклонён.',
      });
  });
  let lastCleanup = 0,
    lastHeartbeat = 0;
  const tick = () => {
    game?.tick?.();
    extraGames.tick();
    if (now() - lastHeartbeat >= 15000) {
      lastHeartbeat = now();
      for (const [res, value] of clients) {
        if (
          res.destroyed ||
          !db
            .prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?')
            .get(value.sessionHash, now())
        ) {
          clients.delete(res);
          res.end();
        } else {
          onlineUsers.set(value.userId, now());
          res.write(': heartbeat\n\n');
        }
      }
    }
    if (now() - lastCleanup >= 60000) {
      lastCleanup = now();
      auth.cleanup();
      for (const [k, v] of requests) if (v.until < now()) requests.delete(k);
      for (const [k, v] of onlineUsers) if (v < now() - 120000) onlineUsers.delete(k);
    }
  };
  const timer = options.testMode
    ? null
    : setInterval(() => {
        try {
          tick();
        } catch (error) {
          console.error('Timer error:', error);
        }
      }, 1000);
  timer?.unref();
  return {
    app,
    db,
    bus,
    tick,
    onlineUsers,
    close: () => {
      if (timer) clearInterval(timer);
      for (const respond of [...pendingPolls]) respond();
      for (const res of clients.keys()) res.end();
      clients.clear();
      game?.close?.();
      extraGames.close();
      bus.removeAllListeners();
      db.close();
    },
  };
}
