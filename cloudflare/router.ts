import type { Express } from 'express';
import { HttpError } from '../server/core';

type Handler = (req: any, res: any, next: (error?: unknown) => void) => unknown;
/** Adapter for the limited JSON/middleware API used by our shared route modules. */
export class JsonRouter {
  private routes: { method: string; path: string; handlers: Handler[] }[] = [];
  private middleware: { path: string; handler: Handler }[] = [];
  use(path: string, handler: Handler) {
    this.middleware.push({ path, handler });
  }
  get(path: string, ...handlers: Handler[]) {
    this.add('GET', path, handlers);
  }
  post(path: string, ...handlers: Handler[]) {
    this.add('POST', path, handlers);
  }
  put(path: string, ...handlers: Handler[]) {
    this.add('PUT', path, handlers);
  }
  patch(path: string, ...handlers: Handler[]) {
    this.add('PATCH', path, handlers);
  }
  delete(path: string, ...handlers: Handler[]) {
    this.add('DELETE', path, handlers);
  }
  private add(method: string, path: string, handlers: Handler[]) {
    this.routes.push({ method, path, handlers });
  }
  asExpress() {
    return this as unknown as Express;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    let status = 200,
      output: unknown,
      sent = false;
    const cookie = (name: string, value: string, options: any = {}) => {
      let text = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
      if (options.secure) text += '; Secure';
      if (options.maxAge !== undefined) text += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
      headers.append('Set-Cookie', text);
    };
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(value: unknown) {
        output = value;
        sent = true;
        return res;
      },
      cookie,
      clearCookie(name: string, options: any) {
        cookie(name, '', { ...options, maxAge: 0 });
      },
    };
    try {
      const segments = url.pathname.split('/');
      let params: Record<string, string> = {};
      const route = this.routes.find((r) => {
        if (r.method !== request.method) return false;
        const pattern = r.path.split('/');
        if (pattern.length !== segments.length) return false;
        const candidate: Record<string, string> = {};
        for (let i = 0; i < pattern.length; i++) {
          if (pattern[i].startsWith(':')) candidate[pattern[i].slice(1)] = decodeURIComponent(segments[i]);
          else if (pattern[i] !== segments[i]) return false;
        }
        params = candidate;
        return true;
      });
      if (!route) throw new HttpError(404, 'API-метод не найден.');
      let body;
      if (!['GET', 'HEAD'].includes(request.method)) {
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        if (reader)
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.length;
            if (length > 4 * 1024 * 1024) {
              await reader.cancel();
              throw new HttpError(413, 'Запрос слишком большой.');
            }
            chunks.push(part.value);
          }
        if (length) body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      const req: any = {
        body,
        method: request.method,
        originalUrl: url.pathname + url.search,
        path: url.pathname,
        params,
        query: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(request.headers),
        ip: request.headers.get('CF-Connecting-IP') || 'unknown',
        secure: url.protocol === 'https:',
        user: undefined,
        get: (name: string) => request.headers.get(name),
        signal: request.signal,
      };
      const chain = [
        ...this.middleware
          .filter((m) => url.pathname === m.path || url.pathname.startsWith(m.path + '/'))
          .map((m) => m.handler),
        ...route.handlers,
      ];
      for (const handler of chain) {
        let proceed = false,
          failure: unknown;
        await handler(req, res, (error?: unknown) => {
          proceed = true;
          failure = error;
        });
        if (failure) throw failure;
        if (sent) break;
        if (!proceed) throw new Error('JSON handler produced no response');
      }
      if (!sent) throw new Error('No JSON response');
    } catch (error) {
      status = error instanceof HttpError ? error.status : error instanceof SyntaxError ? 400 : 500;
      if (status === 500) console.error(error);
      output = {
        error:
          error instanceof HttpError
            ? error.message
            : status === 400
              ? 'Неверный JSON.'
              : 'Ошибка сервера. Попробуйте ещё раз.',
      };
    }
    return new Response(JSON.stringify(output), { status, headers });
  }
}
