import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { DB } from "../../storage";
import { transaction } from "../../storage";
import {
  ActionSchema,
  ContentSchema,
  SettingsSchema,
  StateSchema,
  Id,
  GameError,
  contentIssues,
  type State,
  type Context,
  type Content,
} from "../../../shared/games/jeopardy/types";
import {
  create,
  apply,
  advance,
  project,
  result,
  nextDeadline,
  joinParticipant,
  leaveParticipant,
} from "./engine";
import { migrate } from "./schema";
export type RegisterContext = {
  db: DB;
  requireAuth: RequestHandler;
  requireRole: (...roles: import("../../core").Role[]) => RequestHandler;
  broadcast: () => void;
  now: () => number;
  randomInt?: (maxExclusive: number) => number;
  createId?: () => string;
};
const prefix = "/api/games/jeopardy";
const Command = z.object({
  commandId: z.uuid(),
  expectedVersion: z.number().int().min(0),
});
const RoomRow = z.object({
  id: Id,
  server_id: Id,
  name: z.string(),
  state: z.string(),
  version: z.number().int(),
  deadline: z.number().nullable(),
  active: z.number(),
});
type Room = z.infer<typeof RoomRow>;
const AuthUser = z.object({ id: Id, username: z.string().min(1).max(80) });
function randomInt(max: number): number {
  const top = 0x100000000 - Math.floor(0x100000000 % max);
  let n: number;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0]!;
  } while (n >= top);
  return n % max;
}
export function register(
  app: Express,
  ctx: RegisterContext,
): { tick: () => void; close: () => void; nextDeadline: () => number | null } {
  const db = ctx.db;
  migrate(db);
  let closed = false;
  const limits = new Map<string, { at: number; count: number }>();
  const clock = (): Context => ({
    nowMs: ctx.now(),
    randomInt: ctx.randomInt ?? randomInt,
  });
  const uuid = () => ctx.createId?.() ?? crypto.randomUUID();
  const room = (id: string): Room => {
    const row = db
      .prepare("SELECT * FROM rr_jeopardy_rooms WHERE id=?")
      .get(id);
    if (!row) throw new GameError(404, "Комната недоступна");
    return RoomRow.parse(row);
  };
  const member = (serverId: string, userId: string) => {
    if (
      !db
        .prepare("SELECT 1 FROM server_members WHERE server_id=? AND user_id=?")
        .get(serverId, userId)
    )
      throw new GameError(404, "Комната недоступна");
  };
  const state = (r: Room): State => StateSchema.parse(JSON.parse(r.state));
  const inRoom = (r: Room, userId: string) => {
    member(r.server_id, userId);
    if (
      !db
        .prepare(
          "SELECT 1 FROM rr_jeopardy_participants WHERE room_id=? AND user_id=?",
        )
        .get(r.id, userId)
    )
      throw new GameError(404, "Комната недоступна");
  };
  const pack = (id: string): Content | null => {
    const row = db
      .prepare("SELECT content FROM rr_jeopardy_content WHERE id=?")
      .get(id);
    return row
      ? ContentSchema.parse(
          JSON.parse(z.object({ content: z.string() }).parse(row).content),
        )
      : null;
  };
  const emptyPack = (id: string): Content => ({
    id,
    title: "Набор не загружен",
    revision: 1,
    status: "draft",
    categories: [{ id: "empty", label: "Нет заданий", color: "#2455F5" }],
    questions: [],
  });
  const refreshPresence = (r: Room, s: State, c: Context): State => {
    const copy = structuredClone(s);
    if (copy.phase === "lobby") {
      const latest =
        pack(copy.settings.contentId) ?? emptyPack(copy.settings.contentId);
      if (JSON.stringify(latest) !== JSON.stringify(copy.contentSnapshot)) {
        copy.contentSnapshot = latest;
        copy.players.forEach((p) => (p.ready = false));
      }
    }
    const rows = db
      .prepare(
        "SELECT user_id,last_seen FROM rr_jeopardy_participants WHERE room_id=?",
      )
      .all(r.id)
      .map((v) => z.object({ user_id: Id, last_seen: z.number() }).parse(v));
    for (const p of copy.players) {
      const last = rows.find((x) => x.user_id === p.id)?.last_seen ?? 0;
      const online = last >= 0 && c.nowMs < last + 15000;
      if (online) {
        p.online = true;
        p.offlineSince = null;
      } else if (p.online) {
        p.online = false;
        p.offlineSince = last < 0 ? -last : last + 15000;
      }
    }
    return advance(copy, c);
  };
  const save = (r: Room, s: State, c: Context): Room => {
    const raw = JSON.stringify(StateSchema.parse(s));
    if (raw === r.state) return r;
    db.prepare(
      "UPDATE rr_jeopardy_rooms SET state=?,version=?,deadline=?,active=? WHERE id=?",
    ).run(
      raw,
      r.version + 1,
      nextDeadline(s),
      s.phase === "finished" ? 0 : 1,
      r.id,
    );
    for (const p of s.players)
      db.prepare(
        "INSERT OR IGNORE INTO rr_jeopardy_participants(room_id,user_id,last_seen) VALUES(?,?,?)",
      ).run(r.id, p.id, c.nowMs);
    const ids = s.players.map((p) => p.id);
    for (const row of db
      .prepare("SELECT user_id FROM rr_jeopardy_participants WHERE room_id=?")
      .all(r.id)) {
      const id = z.object({ user_id: Id }).parse(row).user_id;
      if (!ids.includes(id))
        db.prepare(
          "DELETE FROM rr_jeopardy_participants WHERE room_id=? AND user_id=?",
        ).run(r.id, id);
    }
    const final = result(s);
    if (final)
      db.prepare(
        "INSERT OR IGNORE INTO rr_jeopardy_results(session_id,room_id,server_id,result,created_at) VALUES(?,?,?,?,?)",
      ).run(s.sessionId, r.id, r.server_id, JSON.stringify(final), c.nowMs);
    return {
      ...r,
      state: raw,
      version: r.version + 1,
      deadline: nextDeadline(s),
      active: s.phase === "finished" ? 0 : 1,
    };
  };
  const envelope = (r: Room, userId: string) => ({
    view: project(state(r), userId),
    version: r.version,
    serverNow: ctx.now(),
  });
  const envelopeForDeparture = (r: Room, userId: string, before: State) => {
    const s = state(r);
    if (s.players.some((p) => p.id === userId)) return envelope(r, userId);
    const previous = before.players.find((p) => p.id === userId)!;
    const allowed = project(
      { ...s, players: [...s.players, previous] },
      userId,
    );
    allowed.players = s.players;
    return { view: allowed, version: r.version, serverNow: ctx.now() };
  };
  const prior = (userId: string, commandId: string) => {
    const row = db
      .prepare(
        "SELECT room_id,kind,response FROM rr_jeopardy_commands WHERE user_id=? AND command_id=?",
      )
      .get(userId, commandId);
    return row
      ? z
          .object({
            room_id: z.string(),
            kind: z.string(),
            response: z.string().nullable(),
          })
          .parse(row)
      : null;
  };
  const record = (
    u: string,
    c: string,
    r: string,
    k: string,
    response: string | null = null,
  ) =>
    db
      .prepare(
        "INSERT INTO rr_jeopardy_commands(user_id,command_id,room_id,kind,response,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(u, c, r, k, response, ctx.now());
  const guarded =
    (
      handler: (
        req: Parameters<RequestHandler>[0],
        u: z.infer<typeof AuthUser>,
      ) => unknown,
      write = false,
    ): RequestHandler =>
    (req, res) => {
      try {
        if (closed) throw new GameError(503, "Модуль остановлен");
        const user = AuthUser.safeParse("user" in req ? req.user : undefined);
        if (!user.success) throw new GameError(401, "Войдите в аккаунт");
        const key = user.data.id + (write ? ":write" : ":read"),
          now = ctx.now();
        for (const [k, v] of limits) if (now - v.at >= 60000) limits.delete(k);
        const bucket = limits.get(key) ?? { at: now, count: 0 };
        bucket.count++;
        limits.set(key, bucket);
        if (bucket.count > (write ? 120 : 300))
          throw new GameError(429, "Слишком много запросов. Подождите минуту");
        res.json(handler(req, user.data));
      } catch (error) {
        if (error instanceof GameError) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          res.status(400).json({ error: "Некорректный формат запроса" });
          return;
        }
        res.status(500).json({ error: "Не удалось сохранить действие" });
      }
    };
  app.get(
    prefix + "/rooms",
    ctx.requireAuth,
    guarded((req, u) => {
      const serverId = Id.parse(req.query.serverId);
      member(serverId, u.id);
      return {
        rooms: db
          .prepare(
            "SELECT * FROM rr_jeopardy_rooms WHERE server_id=? ORDER BY rowid DESC LIMIT 100",
          )
          .all(serverId)
          .map((raw) => {
            const r = RoomRow.parse(raw),
              s = state(r);
            return {
              id: r.id,
              name: r.name,
              version: r.version,
              phase: s.phase,
              players: s.players.length,
              maxPlayers: 16,
              joined: s.players.some((p) => p.id === u.id),
            };
          }),
      };
    }),
  );
  app.post(
    prefix + "/rooms",
    ctx.requireAuth,
    guarded((req, u) => {
      const body = Command.extend({
        serverId: Id,
        name: z.string().trim().min(1).max(80),
        settings: SettingsSchema,
      })
        .strict()
        .parse(req.body);
      member(body.serverId, u.id);
      let changed = false;
      const out = transaction(db, () => {
        const old = prior(u.id, body.commandId);
        if (old) {
          if (old.kind !== "create")
            throw new GameError(409, "Команда уже использована");
          const r = room(old.room_id);
          if (r.server_id !== body.serverId)
            throw new GameError(409, "Команда уже использована");
          inRoom(r, u.id);
          const c = clock(),
            updated = save(r, refreshPresence(r, state(r), c), c);
          changed = updated.version !== r.version;
          return { roomId: r.id, ...envelope(updated, u.id) };
        }
        if (body.expectedVersion !== 0)
          throw new GameError(409, "Обновите список комнат");
        const count = z
          .object({ n: z.number() })
          .parse(
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM rr_jeopardy_rooms WHERE server_id=? AND active=1",
              )
              .get(body.serverId),
          ).n;
        if (count >= 50)
          throw new GameError(429, "На сервере слишком много открытых комнат");
        const id = uuid(),
          c = clock(),
          s = create({
            sessionId: uuid(),
            hostId: u.id,
            participants: [u],
            settings: body.settings,
            contentSnapshot:
              pack(body.settings.contentId) ??
              emptyPack(body.settings.contentId),
            ctx: c,
          });
        db.prepare(
          "INSERT INTO rr_jeopardy_rooms(id,server_id,name,state,version,deadline,active) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id,
          body.serverId,
          body.name,
          JSON.stringify(s),
          1,
          nextDeadline(s),
          1,
        );
        db.prepare(
          "INSERT INTO rr_jeopardy_participants(room_id,user_id,last_seen) VALUES(?,?,?)",
        ).run(id, u.id, c.nowMs);
        record(u.id, body.commandId, id, "create");
        changed = true;
        return { roomId: id, ...envelope(room(id), u.id) };
      });
      if (changed) ctx.broadcast();
      return out;
    }, true),
  );
  app.get(
    prefix + "/rooms/:id/view",
    ctx.requireAuth,
    guarded((req, u) => {
      const id = Id.parse(req.params.id);
      let changed = false;
      const out = transaction(db, () => {
        const r = room(id);
        inRoom(r, u.id);
        const c = clock();
        db.prepare(
          "UPDATE rr_jeopardy_participants SET last_seen=? WHERE room_id=? AND user_id=?",
        ).run(c.nowMs, id, u.id);
        const updated = save(r, refreshPresence(r, state(r), c), c);
        changed = updated.version !== r.version;
        return envelope(updated, u.id);
      });
      if (changed) ctx.broadcast();
      return out;
    }),
  );
  const kinds = [
    "join",
    "ready",
    "start",
    "actions",
    "leave",
    "rematch",
  ] as const;
  for (const kind of kinds)
    app.post(
      prefix + "/rooms/:id/" + kind,
      ctx.requireAuth,
      guarded((req, u) => {
        const shape =
          kind === "ready"
            ? Command.extend({ ready: z.boolean() }).strict()
            : kind === "actions"
              ? Command.extend({ action: ActionSchema }).strict()
              : Command.strict();
        const b = shape.parse(req.body);
        const id = Id.parse(req.params.id);
        let changed = false;
        const out = transaction(db, () => {
          const r = room(id);
          member(r.server_id, u.id);
          if (kind !== "join" && kind !== "leave") inRoom(r, u.id);
          const old = prior(u.id, b.commandId);
          if (old) {
            if (old.room_id !== id || old.kind !== kind)
              throw new GameError(409, "Команда уже использована");
            if (
              kind === "leave" &&
              old.response &&
              !state(r).players.some((p) => p.id === u.id)
            )
              return JSON.parse(old.response) as unknown;
            inRoom(r, u.id);
            const c = clock(),
              updated = save(r, refreshPresence(r, state(r), c), c);
            changed = updated.version !== r.version;
            return envelope(updated, u.id);
          }
          if (kind === "leave") inRoom(r, u.id);
          if (r.version !== b.expectedVersion)
            throw new GameError(409, "Состояние изменилось. Обновите экран");
          const c = clock();
          let s = refreshPresence(r, state(r), c);
          if (kind === "join") s = joinParticipant(s, u);
          else if (kind === "leave") s = leaveParticipant(s, u.id, c);
          else if (kind === "rematch") {
            if (s.phase !== "finished")
              throw new GameError(422, "Сначала завершите партию");
            if (s.hostId !== u.id)
              throw new GameError(403, "Реванш создаёт ведущий");
            const oldPlayers = s.players;
            s = create({
              sessionId: uuid(),
              hostId: s.hostId,
              participants: s.players.map((p) => ({
                id: p.id,
                username: p.username,
              })),
              settings: s.settings,
              contentSnapshot:
                pack(s.settings.contentId) ?? emptyPack(s.settings.contentId),
              ctx: c,
            });
            s.players.forEach((p) => {
              const old = oldPlayers.find((x) => x.id === p.id)!;
              p.online = old.online;
              p.offlineSince = old.offlineSince;
            });
          } else {
            if (kind === "start") {
              const snapshot = pack(s.settings.contentId);
              if (!snapshot || contentIssues(snapshot).length)
                throw new GameError(
                  422,
                  "Набор не опубликован или заполнен не полностью",
                );
              s.contentSnapshot = snapshot;
            }
            const action =
              kind === "ready"
                ? {
                    type: "ready" as const,
                    ready: z.object({ ready: z.boolean() }).parse(b).ready,
                  }
                : kind === "start"
                  ? { type: "start" as const }
                  : z.object({ action: ActionSchema }).parse(b).action;
            // Start is only routed through /start, which freezes current published content.
            if (
              kind === "actions" &&
              (action.type === "start" || action.type === "ready")
            )
              throw new GameError(422, "Используйте маршрут лобби");
            const before = state(r);
            if (
              ["answer", "buzz", "select"].includes(action.type) &&
              (s.phase !== before.phase ||
                s.phaseStartedAt !== before.phaseStartedAt ||
                s.round !== before.round)
            )
              throw new GameError(422, "Время этого действия истекло");
            s = apply(s, action, u.id, c);
          }
          const updated = save(r, s, c);
          if (kind === "leave")
            db.prepare(
              "UPDATE rr_jeopardy_participants SET last_seen=? WHERE room_id=? AND user_id=?",
            ).run(-c.nowMs, id, u.id);
          else
            db.prepare(
              "UPDATE rr_jeopardy_participants SET last_seen=? WHERE room_id=? AND user_id=?",
            ).run(c.nowMs, id, u.id);
          const reply =
            kind === "leave"
              ? envelopeForDeparture(updated, u.id, state(r))
              : envelope(updated, u.id);
          record(
            u.id,
            b.commandId,
            id,
            kind,
            kind === "leave" ? JSON.stringify(reply) : null,
          );
          changed = updated.version !== r.version;
          return reply;
        });
        if (changed) ctx.broadcast();
        return out;
      }, true),
    );
  const role = ctx.requireRole("admin", "editor");
  app.get(
    prefix + "/content",
    ctx.requireAuth,
    guarded(() => ({
      content: db
        .prepare("SELECT content FROM rr_jeopardy_content")
        .all()
        .map((r) =>
          ContentSchema.parse(
            JSON.parse(z.object({ content: z.string() }).parse(r).content),
          ),
        )
        .filter((c) => c.status === "published")
        .map((c) => ({ id: c.id, title: c.title, issues: contentIssues(c) })),
    })),
  );
  app.get(
    prefix + "/admin/content",
    ctx.requireAuth,
    role,
    guarded(() => ({
      content: db
        .prepare("SELECT content FROM rr_jeopardy_content ORDER BY id")
        .all()
        .map((r) =>
          ContentSchema.parse(
            JSON.parse(z.object({ content: z.string() }).parse(r).content),
          ),
        ),
    })),
  );
  function adminWrite(
    body: unknown,
    userId: string,
    kind: "create" | "update" | "delete" | "import",
    id?: string,
  ) {
    const b =
      kind === "delete"
        ? Command.strict().parse(body)
        : kind === "import"
          ? Command.extend({ content: z.array(ContentSchema).min(1).max(50) })
              .strict()
              .parse(body)
          : Command.extend({ content: ContentSchema }).strict().parse(body);
    const target = id ?? "content";
    let changed = false;
    const out = transaction(db, () => {
      const old = prior(userId, b.commandId);
      if (old) {
        if (old.kind !== "admin:" + kind || old.room_id !== target)
          throw new GameError(409, "Команда уже использована");
        return { ok: true };
      }
      if (kind === "delete") {
        const c = pack(id!);
        if (!c) throw new GameError(404, "Набор не найден");
        if (c.revision !== b.expectedVersion)
          throw new GameError(409, "Набор изменён другим редактором");
        db.prepare("DELETE FROM rr_jeopardy_content WHERE id=?").run(id!);
      } else {
        const content = z
          .object({ content: z.union([ContentSchema, z.array(ContentSchema)]) })
          .parse(b).content;
        const list = Array.isArray(content) ? content : [content];
        if (new Set(list.map((c) => c.id)).size !== list.length)
          throw new GameError(400, "Повтор идентификатора набора");
        for (const c of list) {
          const existing = pack(c.id);
          if (id && c.id !== id)
            throw new GameError(400, "Идентификатор набора не совпадает");
          if (kind === "update" && !existing)
            throw new GameError(404, "Набор не найден");
          if ((kind === "create" || kind === "import") && existing)
            throw new GameError(
              409,
              "Набор уже существует; используйте редактирование",
            );
          const expected = existing?.revision ?? 0;
          if (b.expectedVersion !== expected || c.revision !== expected + 1)
            throw new GameError(409, "Неверная версия набора");
          if (c.status === "published" && contentIssues(c).length)
            throw new GameError(422, contentIssues(c).join(". "));
          db.prepare(
            "INSERT INTO rr_jeopardy_content(id,revision,content) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,content=excluded.content",
          ).run(c.id, c.revision, JSON.stringify(c));
        }
      }
      record(userId, b.commandId, target, "admin:" + kind);
      changed = true;
      return { ok: true };
    });
    if (changed) ctx.broadcast();
    return out;
  }
  app.post(
    prefix + "/admin/content",
    ctx.requireAuth,
    role,
    guarded((req, u) => adminWrite(req.body, u.id, "create"), true),
  );
  app.post(
    prefix + "/admin/content/import",
    ctx.requireAuth,
    role,
    guarded((req, u) => adminWrite(req.body, u.id, "import"), true),
  );
  app.put(
    prefix + "/admin/content/:id",
    ctx.requireAuth,
    role,
    guarded(
      (req, u) => adminWrite(req.body, u.id, "update", Id.parse(req.params.id)),
      true,
    ),
  );
  app.delete(
    prefix + "/admin/content/:id",
    ctx.requireAuth,
    role,
    guarded(
      (req, u) => adminWrite(req.body, u.id, "delete", Id.parse(req.params.id)),
      true,
    ),
  );
  return {
    tick() {
      if (closed) return;
      let changed = false;
      transaction(db, () => {
        for (const raw of db
          .prepare("SELECT * FROM rr_jeopardy_rooms WHERE active=1")
          .all()) {
          const r = RoomRow.parse(raw),
            c = clock(),
            updated = save(r, refreshPresence(r, state(r), c), c);
          changed = changed || updated.version !== r.version;
        }
      });
      if (changed) ctx.broadcast();
    },
    close() {
      closed = true;
      limits.clear();
    },
    nextDeadline() {
      const deadlines: number[] = [];
      for (const raw of db
        .prepare("SELECT * FROM rr_jeopardy_rooms WHERE active=1")
        .all()) {
        const r = RoomRow.parse(raw),
          s = state(r),
          d = nextDeadline(s);
        if (d !== null) deadlines.push(d);
        for (const p of db
          .prepare(
            "SELECT last_seen FROM rr_jeopardy_participants WHERE room_id=?",
          )
          .all(r.id)) {
          const n = z.object({ last_seen: z.number() }).parse(p).last_seen;
          if (n >= 0 && n + 15000 > ctx.now()) deadlines.push(n + 15000);
        }
      }
      return deadlines.length ? Math.min(...deadlines) : null;
    },
  };
}
