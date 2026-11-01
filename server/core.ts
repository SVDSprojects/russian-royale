import type { Request, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export type Role = 'admin' | 'editor' | 'moderator' | 'player';
export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  xp: number;
  avatar: string;
  createdAt: string;
}
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const id = () => randomUUID();
export const iso = (now = Date.now()) => new Date(now).toISOString();
export const norm = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');
export function str(value: unknown, name: string, min = 1, max = 200): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new HttpError(400, `${name}: от ${min} до ${max} символов.`);
  return value.trim();
}
export function boolean(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new HttpError(400, 'Ожидалось логическое значение.');
  return value;
}
export function list(value: unknown, name: string, maxItems = 100, maxLength = 2000): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new HttpError(400, `${name}: неверный список.`);
  return value.map((v) => str(v, name, 0, maxLength));
}
export function integer(value: unknown, name: string, min: number, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new HttpError(400, `${name}: целое число ${min}–${max}.`);
  return Number(value);
}
export function imagePath(value: unknown): string {
  const s = str(value, 'Изображение', 0, 500);
  if (s && !/^\/(?:assets|uploads)\/[a-zA-Z0-9_.-]+$/.test(s))
    throw new HttpError(400, 'Используйте изображение, загруженное на этот сервер.');
  return s;
}
export function publicUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    xp: row.xp,
    avatar: row.avatar,
    createdAt: row.created_at,
  };
}
export function body(req: Request) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    throw new HttpError(400, 'Ожидался JSON-объект.');
  return req.body as Record<string, any>;
}
export type Guard = RequestHandler;
