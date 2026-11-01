// Общие помощники тестов «Кто я»: детерминированная случайность, фикстуры, тестовый сервер.
import { DatabaseSync } from "node:sqlite";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type RequestHandler } from "express";
import type { DB } from "../../../server/storage";
import { migrate, register, type Registration } from "../../../server/games/whoami/index";
import * as engine from "../../../server/games/whoami/engine";
import type { Content, Ctx, Settings, State, Term } from "../../../shared/games/whoami/types";

export const SETTINGS: Settings = { difficulty: "any" };

/** Имена не являются подстроками друг друга: «Термин t01» и «Термин t10» различимы. */
export function term(id: string, extra: Partial<Term> = {}): Term {
  return {
    id,
    revision: 1,
    term: `Термин ${id}`,
    definition: `Определение термина ${id} для теста, достаточно подробное.`,
    acceptedAnswers: [`вариант ${id}`],
    difficulty: 1,
    category: "Тестовая категория",
    equivalenceYo: false,
    ...extra,
  };
}

export const TERMS: Term[] = Array.from({ length: 14 }, (_, i) => term(`t${String(i + 1).padStart(2, "0")}`));
export const CONTENT: Content = { takenAt: 1, terms: TERMS };

/** Генератор с заданной последовательностью; после её конца возвращает 0. */
export function sequence(values: number[]): (max: number) => number {
  let index = 0;
  return (max) => {
    const value = values[index] ?? 0;
    index += 1;
    return value % max;
  };
}

/** Детерминированный PRNG (mulberry32). */
export function seeded(seed: number): (max: number) => number {
  let state = seed >>> 0;
  return (max) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

/** randomInt(max) = max − 1: перемешивание Фишера — Йетса оставляет порядок без изменений. */
export const identity = (max: number) => max - 1;

export const ctxAt = (nowMs: number, randomInt: (max: number) => number = identity): Ctx => ({ nowMs, randomInt });

export const PLAYERS = ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "u11", "u12", "u13"].map((id, index) => ({
  id,
  username: `Игрок ${index + 1}`,
}));

/** Лобби с n готовыми игроками; ведущий — u1. */
export function readyLobby(n: number, content: Content = CONTENT, now = 1_000): State {
  let state = engine.create({ sessionId: "s1", hostId: "u1", participants: PLAYERS.slice(0, n), settings: SETTINGS, contentSnapshot: content, ctx: ctxAt(now) });
  for (const p of PLAYERS.slice(0, n)) state = engine.setReady(state, p.id, true);
  return state;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------- HTTP-сервер для тестов маршрутов ----------

export interface TestServer {
  url: string;
  db: DB;
  registration: Registration;
  clock: { now: number };
  broadcasts: { count: number };
  close: () => Promise<void>;
}

export interface TestUser {
  id: string;
  username: string;
  role: string;
}

export const USERS: TestUser[] = [
  ...PLAYERS.map((p) => ({ ...p, role: "student" })),
  { id: "editor", username: "Редактор", role: "editor" },
  { id: "stranger", username: "Чужак", role: "student" },
];

export function openDb(): DB {
  const db = new DatabaseSync(":memory:") as unknown as DB;
  db.exec("CREATE TABLE server_members (server_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (server_id, user_id));");
  const insert = db.prepare("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)");
  for (const user of USERS) insert.run(user.id === "stranger" ? "srv-other" : "srv", user.id);
  return db;
}

export async function startServer(options: { db?: DB; randomInt?: (max: number) => number; now?: number } = {}): Promise<TestServer> {
  const db = options.db ?? openDb();
  migrate(db);
  const clock = { now: options.now ?? 1_000_000 };
  const broadcasts = { count: 0 };
  const app = express();
  app.use(express.json());
  const requireAuth: RequestHandler = (req, res, next) => {
    const user = USERS.find((u) => u.id === req.header("x-test-user"));
    if (!user) {
      res.status(401).json({ error: "Нужно войти" });
      return;
    }
    (req as typeof req & { user?: TestUser }).user = {...user,role:user.role as import("../../../server/core").Role,email:"test@example.test",xp:0,avatar:"",createdAt:"2026-11-01"};
    next();
  };
  const requireRole =
    (...roles: string[]): RequestHandler =>
    (req, res, next) => {
      const user = (req as typeof req & { user?: TestUser }).user;
      if (!user || !roles.includes(user.role)) {
        res.status(403).json({ error: "Недостаточно прав" });
        return;
      }
      next();
    };
  const registration = register(app, {
    db,
    requireAuth,
    requireRole,
    broadcast: () => {
      broadcasts.count += 1;
    },
    now: () => clock.now,
    randomInt: options.randomInt ?? identity,
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    db,
    registration,
    clock,
    broadcasts,
    close: () =>
      new Promise((resolve) => {
        registration.close();
        server.close(() => resolve());
      }),
  };
}

export interface Reply {
  status: number;
  body: Record<string, unknown> & { version?: number; view?: Record<string, unknown> & { phase?: string }; error?: string; roomId?: string };
  raw: string;
}

export async function http(server: TestServer, user: string | null, method: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${server.url}/api/games/whoami${path}`, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  return { status: response.status, body: raw ? (JSON.parse(raw) as Reply["body"]) : {}, raw };
}

export const uuid = () => globalThis.crypto.randomUUID();

/** Команда с актуальной версией: сначала читает view. */
export async function command(server: TestServer, user: string, roomId: string, route: string, extra: Record<string, unknown> = {}): Promise<Reply> {
  const view = await http(server, user, "GET", `/rooms/${roomId}/view`);
  return http(server, user, "POST", `/rooms/${roomId}/${route}`, { commandId: uuid(), expectedVersion: view.body.version, ...extra });
}

export async function seedTerms(server: TestServer, terms: Term[] = TERMS): Promise<void> {
  const report = await http(server, "editor", "POST", "/admin/content/import", { items: terms.map((item) => ({ status: "published", item })) });
  if (report.status !== 200) throw new Error(`seed failed: ${report.raw}`);
}

/** Комната с n игроками, все готовы. Возвращает roomId. */
export async function lobbyWith(server: TestServer, n: number): Promise<string> {
  const created = await http(server, "u1", "POST", "/rooms", { serverId: "srv", name: "Тест", commandId: uuid(), expectedVersion: 0 });
  const roomId = String(created.body.roomId);
  for (const p of PLAYERS.slice(1, n)) {
    const joined = await command(server, p.id, roomId, "join");
    if (joined.status !== 200) throw new Error(`join failed: ${joined.raw}`);
  }
  for (const p of PLAYERS.slice(0, n)) {
    server.clock.now += 200;
    await command(server, p.id, roomId, "ready", { ready: true });
  }
  return roomId;
}
