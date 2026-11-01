// HTTP-маршруты /api/games/whoami. Только JSON get/post/put/delete, без listen, файлов, WebSocket и SSE.

import type { Express, Request, RequestHandler, Response } from "express";
import type { DB } from "../../storage";
import { transaction } from "../../storage";
import * as engine from "./engine";
import { EngineError } from "./engine";
import { buildContent, itemTitle, MIN_PUBLISHED_FOR_START, parseItem, reviewItem, type Item } from "./content";
import { statusOf, Store, type ContentRow, type RoomRow } from "./store";
import {
  GAME_ID,
  GAME_TITLE,
  LIMITS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  isRecord,
  isUuid,
  parseGameAction,
  parseSettings,
  parseText,
  type ContentStatus,
  type Ctx,
  type Result,
  type State,
} from "../../../shared/games/whoami/types";

export const API_PREFIX = "/api/games/whoami";

export interface AuthUser {
  id: string | number;
  username?: string;
  name?: string;
  role?: string;
}

export interface ResultMeta {
  gameId: string;
  roomId: string;
  serverId: string;
}

export interface ModuleContext {
  db: DB;
  requireAuth: RequestHandler;
  requireRole: (...roles: import("../../core").Role[]) => RequestHandler;
  broadcast: () => void;
  now: () => number;
  /** Подменяется в тестах. По умолчанию — криптостойкий генератор. */
  randomInt?: (maxExclusive: number) => number;
  /** Точка подключения будущего единого XP-сервиса. Вызывается после commit, ровно один раз на sessionId. */
  onResult?: (result: Result, meta: ResultMeta) => void;
}

export interface Registration {
  tick: () => void;
  close: () => void;
  /** Ближайший момент, когда нужен tick (для объединения с чужим Durable Object alarm). */
  nextWakeAt: () => number | null;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ENGINE_STATUS: Record<engine.EngineErrorCode, number> = { illegal: 422, forbidden: 403, rate: 429, content: 422, empty: 422 };
const COMMAND_WINDOW_MS = 1_000;
const COMMAND_BURST = 10;
const ROOM_LIST_WINDOW_MS = 24 * 60 * 60 * 1000;
const COMMAND_TTL_MS = 24 * 60 * 60 * 1000;
const PRESENCE_WAKE_MS = 5_000;
const IMPORT_LIMIT = 500;

export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("randomInt: неверная граница");
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % maxExclusive;
  }
}

interface User {
  id: string;
  username: string;
  role: string;
}

function userOf(req: Request): User {
  const raw = (req as Request & { user?: AuthUser }).user;
  if (!raw || raw.id === undefined || raw.id === null || String(raw.id) === "") throw new HttpError(401, "Нужно войти в аккаунт");
  const name = String(raw.username ?? raw.name ?? `Игрок ${String(raw.id)}`).trim().slice(0, LIMITS.usernameChars);
  return { id: String(raw.id), username: name || `Игрок ${String(raw.id)}`, role: String(raw.role ?? "") };
}

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (body === undefined || body === null) return {};
  if (!isRecord(body)) throw new HttpError(400, "Ожидается JSON-объект");
  return body;
}

interface Command {
  commandId: string;
  expectedVersion: number;
}

function commandOf(body: Record<string, unknown>): Command {
  if (!isUuid(body.commandId)) throw new HttpError(400, "commandId должен быть UUID");
  const version = body.expectedVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) throw new HttpError(400, "expectedVersion должен быть целым числом");
  return { commandId: body.commandId, expectedVersion: version };
}

function paramId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new HttpError(404, "Комната недоступна");
  return id;
}

function withoutPresence(state: State): string {
  return JSON.stringify({ ...state, participants: state.participants.map((p) => ({ ...p, online: false })) });
}

interface Effects {
  broadcast: boolean;
  results: { result: Result; meta: ResultMeta }[];
}

interface Snapshot {
  room: RoomRow;
  state: State;
}

export function createRoutes(app: Express, ctx: ModuleContext): Registration {
  const store = new Store(ctx.db);
  const randomInt = ctx.randomInt ?? secureRandomInt;
  const recentCommands = new Map<string, number[]>();
  let lastPrune = 0;
  const gameCtx = (nowMs: number): Ctx => ({ nowMs, randomInt });
  const admin = [ctx.requireAuth, ctx.requireRole("admin", "editor")];

  /** Снимок опубликованного контента. takenAt — время последней правки, поэтому снимок стабилен между запросами. */
  function contentSnapshot(nowMs: number) {
    const rows = store.listContent().filter((row) => row.status === "published");
    const takenAt = rows.reduce((max, row) => Math.max(max, row.updatedAt), 0);
    return buildContent(
      rows.map((row) => row.item),
      Math.min(takenAt, nowMs),
    );
  }

  function persist(snapshot: Snapshot, nextState: State, now: number, effects: Effects, newSessionId?: string, bumpVersion = true): Snapshot {
    const sessionId = newSessionId ?? snapshot.room.sessionId;
    const room: RoomRow = {
      ...snapshot.room,
      sessionId,
      hostId: nextState.hostId,
      version: snapshot.room.version + (bumpVersion ? 1 : 0),
      status: statusOf(nextState.phase),
      phase: nextState.phase,
      playerCount: nextState.participants.filter((p) => !p.left).length,
      deadlineMs: engine.nextDeadline(nextState),
      updatedAt: now,
    };
    if (newSessionId) store.insertSession(sessionId, room.id, room.serverId, nextState, now);
    else store.saveState(sessionId, nextState, now);
    store.updateRoom(room, snapshot.room.version);
    const result = engine.result(nextState);
    if (result && store.insertResult(result, room.id, room.serverId, now)) {
      effects.results.push({ result, meta: { gameId: GAME_ID, roomId: room.id, serverId: room.serverId } });
    }
    effects.broadcast = true;
    return { room, state: nextState };
  }

  /** Аутентификация уже пройдена: проверяет членство, отмечает присутствие и обрабатывает просроченные фазы. */
  function load(roomId: string, user: User | null, now: number, effects: Effects): Snapshot {
    const room = store.getRoom(roomId);
    if (!room) throw new HttpError(404, "Комната недоступна");
    if (user && !store.isServerMember(room.serverId, user.id)) throw new HttpError(404, "Комната недоступна");
    const state = store.getState(room.sessionId);
    if (!state) throw new HttpError(404, "Комната недоступна");
    let next = state.phase === "lobby" ? engine.withContent(state, contentSnapshot(now)) : state;
    // Момент отмены считается по отметкам до этого запроса: вернувшийся игрок не отменяет уже наступившее отсутствие всех.
    const lastSeen = store.lastSeen(room.id);
    const cutoff = engine.absenceCutoff(next, lastSeen);
    next = engine.advance(next, gameCtx(cutoff === null ? now : Math.min(now, cutoff)));
    if (cutoff !== null && cutoff <= now) next = engine.syncPresence(next, lastSeen, cutoff);
    if (user && state.participants.some((p) => p.id === user.id && !p.left)) {
      store.touch(room.id, user.id, now);
      lastSeen[user.id] = now;
    }
    next = engine.syncPresence(next, lastSeen, now);
    next = engine.advance(next, gameCtx(now));
    if (JSON.stringify(next) === JSON.stringify(state)) return { room, state };
    // Отметки «в сети» — не игровое состояние: сохраняются без новой версии, чтобы не отклонять честные ходы с 409.
    return persist({ room, state }, next, now, effects, undefined, withoutPresence(next) !== withoutPresence(state));
  }

  function flush(effects: Effects): void {
    if (effects.broadcast) ctx.broadcast();
    for (const entry of effects.results) {
      try {
        ctx.onResult?.(entry.result, entry.meta);
      } catch (error) {
        console.error(`[${GAME_ID}] onResult failed`, error);
      }
    }
  }

  function send(res: Response, snapshot: Snapshot, user: User, now: number, status = 200): void {
    res.status(status).json({ view: engine.project(snapshot.state, user.id), version: snapshot.room.version, serverNow: now, roomId: snapshot.room.id });
  }

  function fail(res: Response, error: unknown): void {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof EngineError) {
      res.status(ENGINE_STATUS[error.code]).json({ error: error.message });
      return;
    }
    console.error(`[${GAME_ID}] unexpected error`, error);
    res.status(500).json({ error: "Внутренняя ошибка сервера. Попробуйте ещё раз" });
  }

  /** Скользящее окно: не больше COMMAND_BURST команд пользователя за COMMAND_WINDOW_MS. */
  function throttle(userId: string, now: number): void {
    const recent = (recentCommands.get(userId) ?? []).filter((at) => now - at < COMMAND_WINDOW_MS && at <= now);
    if (recent.length >= COMMAND_BURST) throw new HttpError(429, "Слишком много запросов — подождите немного");
    recentCommands.set(userId, [...recent, now]);
    if (recentCommands.size > 5_000) recentCommands.clear();
  }

  type Operation = (snapshot: Snapshot, user: User, gctx: Ctx, body: Record<string, unknown>) => { state: State; newSessionId?: string };

  function command(operation: Operation): RequestHandler {
    return (req, res) => {
      try {
        const user = userOf(req);
        const body = bodyOf(req);
        const cmd = commandOf(body);
        const roomId = paramId(req);
        const now = ctx.now();
        throttle(user.id, now);
        const effects: Effects = { broadcast: false, results: [] };
        const snapshot = transaction(ctx.db, () => {
          const prior = store.findCommand(user.id, cmd.commandId);
          const current = load(roomId, user, now, effects);
          if (prior) {
            if (prior.roomId !== roomId) throw new HttpError(409, "Команда с таким commandId уже использована");
            return current;
          }
          if (cmd.expectedVersion !== current.room.version) {
            throw new HttpError(409, "Состояние комнаты изменилось. Экран обновлён — повторите действие");
          }
          const outcome = operation(current, user, gameCtx(now), body);
          const saved = persist(current, outcome.state, now, effects, outcome.newSessionId);
          store.insertCommand(user.id, cmd.commandId, roomId, saved.room.version, now);
          return saved;
        });
        flush(effects);
        send(res, snapshot, user, now);
      } catch (error) {
        fail(res, error);
      }
    };
  }

  // ---------- каталог и комнаты ----------

  app.get(`${API_PREFIX}/catalog`, ctx.requireAuth, (req, res) => {
    try {
      userOf(req);
      const published = store.countPublished();
      res.json({
        gameId: GAME_ID,
        title: GAME_TITLE,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        publishedCount: published,
        enoughContent: published >= MIN_PUBLISHED_FOR_START,
        serverNow: ctx.now(),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get(`${API_PREFIX}/rooms`, ctx.requireAuth, (req, res) => {
    try {
      const user = userOf(req);
      const serverId = req.query.serverId;
      if (typeof serverId !== "string" || serverId.length === 0 || serverId.length > 64) throw new HttpError(400, "Укажите serverId");
      if (!store.isServerMember(serverId, user.id)) throw new HttpError(403, "Вы не состоите в этом сервере");
      const now = ctx.now();
      const rooms = store.listRooms(serverId, now - ROOM_LIST_WINDOW_MS).map((room) => ({
        id: room.id,
        name: room.name,
        status: room.status,
        phase: room.phase,
        playerCount: room.playerCount,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        joinable: room.status === "lobby" && room.playerCount < MAX_PLAYERS,
        updatedAt: room.updatedAt,
      }));
      res.json({ rooms, serverNow: now });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post(`${API_PREFIX}/rooms`, ctx.requireAuth, (req, res) => {
    try {
      const user = userOf(req);
      const body = bodyOf(req);
      const cmd = commandOf(body);
      if (cmd.expectedVersion !== 0) throw new HttpError(409, "Для создания комнаты expectedVersion = 0");
      if (typeof body.serverId !== "string" || body.serverId.length === 0 || body.serverId.length > 64) throw new HttpError(400, "Укажите serverId");
      const serverId = body.serverId;
      const name = parseText(body.name, "Название комнаты", 1, LIMITS.roomNameChars);
      if (!name.ok) throw new HttpError(400, name.error);
      const settings = parseSettings(body.settings);
      if (!settings.ok) throw new HttpError(400, settings.error);
      const now = ctx.now();
      throttle(user.id, now);
      const effects: Effects = { broadcast: false, results: [] };
      const snapshot = transaction(ctx.db, () => {
        if (!store.isServerMember(serverId, user.id)) throw new HttpError(403, "Вы не состоите в этом сервере");
        const prior = store.findCommand(user.id, cmd.commandId);
        if (prior) return load(prior.roomId, user, now, effects);
        const roomId = globalThis.crypto.randomUUID();
        const sessionId = globalThis.crypto.randomUUID();
        const state = engine.create({
          sessionId,
          hostId: user.id,
          participants: [{ id: user.id, username: user.username }],
          settings: settings.value,
          contentSnapshot: contentSnapshot(now),
          ctx: gameCtx(now),
        });
        const room: RoomRow = {
          id: roomId,
          serverId,
          name: name.value,
          hostId: user.id,
          sessionId,
          version: 1,
          status: "lobby",
          phase: "lobby",
          playerCount: 1,
          deadlineMs: null,
          createdBy: user.id,
          createdAt: now,
          updatedAt: now,
        };
        store.insertRoom(room);
        store.insertSession(sessionId, roomId, serverId, state, now);
        store.upsertMember(roomId, serverId, user.id, user.username, now);
        store.insertCommand(user.id, cmd.commandId, roomId, room.version, now);
        effects.broadcast = true;
        return { room, state };
      });
      flush(effects);
      send(res, snapshot, user, now, 201);
    } catch (error) {
      fail(res, error);
    }
  });

  app.get(`${API_PREFIX}/rooms/:id/view`, ctx.requireAuth, (req, res) => {
    try {
      const user = userOf(req);
      const roomId = paramId(req);
      const now = ctx.now();
      const effects: Effects = { broadcast: false, results: [] };
      const snapshot = transaction(ctx.db, () => load(roomId, user, now, effects));
      flush(effects);
      send(res, snapshot, user, now);
    } catch (error) {
      fail(res, error);
    }
  });

  app.post(
    `${API_PREFIX}/rooms/:id/join`,
    ctx.requireAuth,
    command((snapshot, user, gctx) => {
      const state = engine.join(snapshot.state, { id: user.id, username: user.username }, gctx);
      store.upsertMember(snapshot.room.id, snapshot.room.serverId, user.id, user.username, gctx.nowMs);
      return { state };
    }),
  );

  app.post(
    `${API_PREFIX}/rooms/:id/ready`,
    ctx.requireAuth,
    command((snapshot, user, _gctx, body) => {
      if (typeof body.ready !== "boolean") throw new HttpError(400, "ready должен быть логическим");
      return { state: engine.setReady(snapshot.state, user.id, body.ready) };
    }),
  );

  app.post(
    `${API_PREFIX}/rooms/:id/start`,
    ctx.requireAuth,
    command((snapshot, user, gctx) => ({ state: engine.start(snapshot.state, user.id, gctx) })),
  );

  app.post(
    `${API_PREFIX}/rooms/:id/actions`,
    ctx.requireAuth,
    command((snapshot, user, gctx, body) => {
      const action = parseGameAction(body.action);
      if (!action.ok) throw new HttpError(400, action.error);
      return { state: engine.apply(snapshot.state, action.value, user.id, gctx) };
    }),
  );

  app.post(
    `${API_PREFIX}/rooms/:id/leave`,
    ctx.requireAuth,
    command((snapshot, user, gctx) => {
      if (!snapshot.state.participants.some((p) => p.id === user.id)) throw new EngineError("forbidden", "Вы не в этой комнате");
      store.markLeft(snapshot.room.id, user.id, gctx.nowMs);
      return { state: engine.leave(snapshot.state, user.id, gctx) };
    }),
  );

  app.post(
    `${API_PREFIX}/rooms/:id/rematch`,
    ctx.requireAuth,
    command((snapshot, user, gctx) => {
      const newSessionId = globalThis.crypto.randomUUID();
      const state = engine.withContent(engine.rematch(snapshot.state, newSessionId, user.id, gctx), contentSnapshot(gctx.nowMs));
      return { state, newSessionId };
    }),
  );

  // ---------- редактор контента ----------

  const ADMIN = `${API_PREFIX}/admin/content`;

  function adminRow(row: ContentRow, all: readonly Item[]) {
    return { id: row.id, status: row.status, revision: row.revision, updatedAt: row.updatedAt, updatedBy: row.updatedBy, item: row.item, review: reviewItem(row.item, all) };
  }

  function adminHandler(handler: (req: Request, user: User, now: number) => { status?: number; body: unknown }): RequestHandler {
    return (req, res) => {
      try {
        const user = userOf(req);
        const now = ctx.now();
        const out = transaction(ctx.db, () => handler(req, user, now));
        res.status(out.status ?? 200).json(out.body);
      } catch (error) {
        fail(res, error);
      }
    };
  }

  function revisionOf(value: unknown): number {
    const revision = typeof value === "string" ? Number(value) : value;
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) throw new HttpError(400, "Укажите expectedRevision");
    return revision;
  }

  function parsedItem(raw: unknown): Item {
    const parsed = parseItem(raw);
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    return parsed.value;
  }

  const newContentId = () => `c-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  app.get(ADMIN, ...admin, adminHandler(() => {
    const rows = store.listContent();
    const all = rows.map((r) => r.item);
    return { body: { items: rows.map((row) => adminRow(row, all)) } };
  }));

  app.post(`${ADMIN}/check`, ...admin, adminHandler((req) => {
    const item = parsedItem(bodyOf(req).item);
    return { body: { item, review: reviewItem(item, store.listContent().map((r) => r.item)) } };
  }));

  app.get(`${ADMIN}/export`, ...admin, adminHandler((_req, _user, now) => ({
    body: { gameId: GAME_ID, format: 1, exportedAt: now, items: store.listContent().map((row) => ({ id: row.id, status: row.status, item: row.item })) },
  })));

  app.post(ADMIN, ...admin, adminHandler((req, user, now) => {
    const id = newContentId();
    const item = { ...parsedItem(bodyOf(req).item), id, revision: 1 };
    const row: ContentRow = { id, status: "draft", revision: 1, item, createdAt: now, updatedAt: now, updatedBy: user.id };
    store.insertContent(row);
    return { status: 201, body: adminRow(row, store.listContent().map((r) => r.item)) };
  }));

  app.put(`${ADMIN}/:id`, ...admin, adminHandler((req, user, now) => {
    const body = bodyOf(req);
    const existing = store.getContent(String(req.params.id));
    if (!existing) throw new HttpError(404, "Запись не найдена");
    const expected = revisionOf(body.expectedRevision);
    if (expected !== existing.revision) throw new HttpError(409, "Запись изменена другим редактором — обновите список");
    const item = { ...parsedItem(body.item), id: existing.id, revision: existing.revision + 1 };
    const others = store.listContent().map((r) => r.item);
    if (existing.status === "published" && reviewItem(item, others).errors.length > 0) {
      throw new HttpError(422, "Опубликованная запись должна оставаться корректной. Снимите с публикации или исправьте ошибки");
    }
    const row: ContentRow = { ...existing, item, revision: existing.revision + 1, updatedAt: now, updatedBy: user.id };
    if (!store.updateContent(row, existing.revision)) throw new HttpError(409, "Запись изменена другим редактором — обновите список");
    return { body: adminRow(row, others) };
  }));

  app.post(`${ADMIN}/:id/status`, ...admin, adminHandler((req, user, now) => {
    const body = bodyOf(req);
    const status = body.status;
    if (status !== "draft" && status !== "published") throw new HttpError(400, "status: draft или published");
    const existing = store.getContent(String(req.params.id));
    if (!existing) throw new HttpError(404, "Запись не найдена");
    if (revisionOf(body.expectedRevision) !== existing.revision) throw new HttpError(409, "Запись изменена другим редактором — обновите список");
    const others = store.listContent().map((r) => r.item);
    const review = reviewItem(existing.item, others);
    if (status === "published" && review.errors.length > 0) throw new HttpError(422, `Нельзя опубликовать: ${review.errors.join("; ")}`);
    const row: ContentRow = { ...existing, status, revision: existing.revision + 1, item: { ...existing.item, revision: existing.revision + 1 }, updatedAt: now, updatedBy: user.id };
    if (!store.updateContent(row, existing.revision)) throw new HttpError(409, "Запись изменена другим редактором — обновите список");
    return { body: adminRow(row, others) };
  }));

  app.delete(`${ADMIN}/:id`, ...admin, adminHandler((req) => {
    const existing = store.getContent(String(req.params.id));
    if (!existing) throw new HttpError(404, "Запись не найдена");
    if (revisionOf(req.query.expectedRevision) !== existing.revision) throw new HttpError(409, "Запись изменена другим редактором — обновите список");
    if (!store.deleteContent(existing.id, existing.revision)) throw new HttpError(409, "Запись изменена другим редактором — обновите список");
    return { body: { deleted: existing.id } };
  }));

  app.post(`${ADMIN}/import`, ...admin, adminHandler((req, user, now) => {
    const entries = bodyOf(req).items;
    if (!Array.isArray(entries) || entries.length === 0) throw new HttpError(400, "items: непустой список");
    if (entries.length > IMPORT_LIMIT) throw new HttpError(400, `За один импорт — не больше ${IMPORT_LIMIT} записей`);
    const report = { created: 0, updated: 0, published: 0, drafts: [] as { title: string; errors: string[] }[], rejected: [] as { index: number; error: string }[] };
    entries.forEach((entry: unknown, index: number) => {
      const raw = isRecord(entry) && "item" in entry ? entry.item : entry;
      const wanted: ContentStatus = isRecord(entry) && entry.status === "published" ? "published" : "draft";
      const parsed = parseItem(raw);
      if (!parsed.ok) {
        report.rejected.push({ index, error: parsed.error });
        return;
      }
      const existing = parsed.value.id ? store.getContent(parsed.value.id) : undefined;
      const id = existing?.id ?? (parsed.value.id || newContentId());
      const revision = (existing?.revision ?? 0) + 1;
      const item = { ...parsed.value, id, revision };
      const review = reviewItem(item, store.listContent().map((r) => r.item));
      const status: ContentStatus = wanted === "published" && review.errors.length === 0 ? "published" : "draft";
      if (wanted === "published" && status === "draft") report.drafts.push({ title: itemTitle(item), errors: review.errors });
      const row: ContentRow = { id, status, revision, item, createdAt: existing?.createdAt ?? now, updatedAt: now, updatedBy: user.id };
      if (existing) {
        store.updateContent(row, existing.revision);
        report.updated += 1;
      } else {
        store.insertContent(row);
        report.created += 1;
      }
      if (status === "published") report.published += 1;
    });
    return { body: report };
  }));

  // ---------- планировщик ----------

  function tick(): void {
    const now = ctx.now();
    const effects: Effects = { broadcast: false, results: [] };
    for (const room of store.activeRooms()) {
      try {
        transaction(ctx.db, () => load(room.id, null, now, effects));
      } catch (error) {
        console.error(`[${GAME_ID}] tick failed for room ${room.id}`, error);
      }
    }
    if (now - lastPrune > 10 * 60 * 1000) {
      lastPrune = now;
      store.pruneCommands(now - COMMAND_TTL_MS);
    }
    flush(effects);
  }

  function nextWakeAt(): number | null {
    const deadline = store.earliestDeadline();
    const presence = store.activeRooms().length > 0 ? ctx.now() + PRESENCE_WAKE_MS : null;
    if (deadline === null) return presence;
    if (presence === null) return deadline;
    return Math.min(deadline, presence);
  }

  return {
    tick,
    nextWakeAt,
    close: () => recentCommands.clear(),
  };
}
