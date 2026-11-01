import {registerPublicServers} from '../server/public-servers';
import { addContentPack } from '../server/content-pack';
import { DurableObject } from 'cloudflare:workers';
import { imageSize } from 'image-size';
import { JsonRouter } from './router';
import { durableDatabase } from './database';
import { setupAuth, sessionHash } from '../server/auth';
import { setupContent } from '../server/content';
import { registerExtraGames } from '../server/games/register';
import { registerWaitingGames } from '../server/waiting-games';
import { registerGameRoutes } from '../server/game';
import { seed } from '../server/seed';
import { HttpError } from '../server/core';
import foundation from '../migrations/001-foundation.sql';
import multiplayer from '../migrations/002-multiplayer.sql';

interface Env {
  ROYALE: DurableObjectNamespace<Royale>;
  ASSETS: Fetcher;
}

export class Royale extends DurableObject<Env> {
  private db;
  private router = new JsonRouter();
  private game;
  private extraGames;
  private revision = crypto.randomUUID();
  private waiters = new Set<() => void>();
  private online = new Map<string, number>();
  private requests = new Map<string, { count: number; until: number }>();
  private cleanedAt = 0;
  private auth;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = durableDatabase(ctx.storage);
    this.db.exec(foundation);
    seed(this.db);
    addContentPack(this.db);
    this.db.exec(multiplayer);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS upload_parts (name TEXT, part INTEGER, mime TEXT, bytes BLOB NOT NULL, PRIMARY KEY(name,part));',
    );
    const app = this.router.asExpress();
    const broadcast = () => {
      this.revision = crypto.randomUUID();
      for (const finish of [...this.waiters]) finish();
    };
    this.auth = setupAuth(app, this.db, Date.now, false);
    app.use('/api', (req, _res, next) => {
      if (req.user) this.online.set(req.user.id, Date.now());
      next();
    });
    app.get('/api/health', (_req, res) =>
      res.json({ ok: true, serverNow: Date.now(), hosting: 'cloudflare', release: 'waiting-games-1' }),
    );
    app.get('/api/updates', this.auth.requireAuth, async (req, res) => {
      if (req.query.after === this.revision) {
        if (this.waiters.size >= 150) throw new HttpError(429, 'Слишком много подключений.');
        await new Promise<void>((resolve) => {
          const signal = (req as any).signal as AbortSignal;
          const finish = () => {
            clearTimeout(timer);
            this.waiters.delete(finish);
            signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = setTimeout(finish, 20000);
          this.waiters.add(finish);
          signal.addEventListener('abort', finish, { once: true });
          if (signal.aborted) finish();
        });
      }
      if (
        !this.db
          .prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?')
          .get(sessionHash(req), Date.now())
      )
        throw new HttpError(401, 'Войдите в аккаунт.');
      res.json({ version: this.revision, serverNow: Date.now() });
    });
    const context = {
      db: this.db,
      requireAuth: this.auth.requireAuth,
      requireRole: this.auth.requireRole,
      now: Date.now,
      broadcast,
      onlineUsers: this.online,
      uploadsDir: '',
      saveImage: async (buffer: Buffer, format: string) => {
        let dimensions;
        try {
          dimensions = imageSize(buffer);
        } catch {
          throw new HttpError(400, 'Не удалось прочитать изображение.');
        }
        const expected = format === 'jpeg' ? 'jpg' : format;
        if (
          dimensions.type !== expected ||
          !dimensions.width ||
          !dimensions.height ||
          dimensions.width * dimensions.height > 16_000_000
        )
          throw new HttpError(400, 'Неверный формат или размер изображения. Максимум 16 мегапикселей.');
        const name = crypto.randomUUID() + '.' + format;
        this.ctx.storage.transactionSync(() => {
          for (let offset = 0, part = 0; offset < buffer.length; offset += 256 * 1024, part++) {
            const bytes = new Uint8Array(buffer.subarray(offset, offset + 256 * 1024));
            this.ctx.storage.sql.exec(
              'INSERT INTO upload_parts VALUES(?,?,?,?)',
              name,
              part,
              `image/${format}`,
              bytes.buffer,
            );
          }
        });
        return name;
      },
    };
    registerPublicServers(app,context);
    this.game = registerGameRoutes(app, context);
    this.extraGames = registerExtraGames(app, context);
    registerWaitingGames(app, context);
    setupContent(app, context);
  }
  private async schedule() {
    const row = this.db
      .prepare("SELECT MIN(deadline) AS deadline FROM rooms WHERE phase IN ('discussion','voting','guess')")
      .get();
    const deadlines = [row?.deadline, this.extraGames.nextDeadline()].filter((d) => d != null).map(Number);
    if (deadlines.length) {
      const deadline = Math.max(Date.now() + 100, Math.min(...deadlines));
      const current = await this.ctx.storage.getAlarm();
      if (current === null || Math.abs(current - deadline) > 500) await this.ctx.storage.setAlarm(deadline);
    }
  }
  async alarm() {
    this.game.tick();
    this.extraGames.tick();
    await this.schedule();
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/uploads/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
      const name = url.pathname.slice(9);
      if (!/^[a-f0-9-]+\.(png|jpeg|webp|gif)$/.test(name)) return new Response(null, { status: 404 });
      const parts = this.ctx.storage.sql
        .exec<{ bytes: ArrayBuffer; mime: string }>(
          'SELECT bytes,mime FROM upload_parts WHERE name=? ORDER BY part',
          name,
        )
        .toArray();
      if (!parts.length) return new Response(null, { status: 404 });
      return new Response(request.method === 'HEAD' ? null : new Blob(parts.map((p) => p.bytes)), {
        headers: {
          'Content-Type': parts[0].mime,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
    const now = Date.now(),
      ip = request.headers.get('CF-Connecting-IP') || 'local';
    const rate = this.requests.get(ip) || { count: 0, until: now + 60000 };
    if (rate.until <= now) {
      rate.count = 0;
      rate.until = now + 60000;
    }
    this.requests.set(ip, rate);
    if (++rate.count > 3000)
      return Response.json({ error: 'Слишком много запросов. Подождите минуту.' }, { status: 429 });
    if (now - this.cleanedAt > 60000) {
      this.cleanedAt = now;
      this.auth.cleanup();
      for (const [key, value] of this.requests) if (value.until < now) this.requests.delete(key);
      for (const [key, value] of this.online) if (value < now - 120000) this.online.delete(key);
    }
    this.game.tick();
    this.extraGames.tick();
    // Start deadline scheduling before long polling awaits a notification.
    await this.schedule();
    const response = await this.router.fetch(request);
    await this.schedule();
    return response;
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    let response: Response;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.headers.get('Origin');
        if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
          return Response.json({ error: 'Запрос с другого сайта запрещён.' }, { status: 403 });
      }
      response = await env.ROYALE.get(env.ROYALE.idFromName('main')).fetch(request);
    } else if (url.pathname === '/admin') {
      response = Response.redirect(url.origin + '/admin.html', 302);
    } else {
      if (url.pathname === '/' || url.pathname.startsWith('/invite/')) url.pathname = '/index.html';
      response = await env.ASSETS.fetch(new Request(url, request));
    }
    const result = new Response(response.body, response);
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('X-Royale-Release', 'waiting-games-1');
    result.headers.set('Referrer-Policy', 'same-origin');
    result.headers.set('X-Frame-Options', 'DENY');
    if (!url.pathname.startsWith('/uploads/'))
      result.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
    return result;
  },
} satisfies ExportedHandler<Env>;
