import type { Express, RequestHandler, Request, Response } from "express";
import { z } from "zod";
import type { DB } from "../../storage";
import { transaction } from "../../storage";
import {
  ActionSchema,
  CommandSchema,
  ContentSchema,
  SettingsSchema,
  StateSchema,
  GameError,
} from "../../../shared/games/durak/types";
import type {
  State,
  View,
  Settings,
  Content,
} from "../../../shared/games/durak/types";
import {
  create,
  apply,
  advance,
  project,
  result,
  cancel,
  nextDeadline,
} from "./engine";
export interface ServerContext {
  db: DB;
  requireAuth: RequestHandler;
  requireRole: (...roles: import("../../core").Role[]) => RequestHandler;
  broadcast: () => void;
  now: () => number;
}
interface Member {
  id: string;
  username: string;
  ready: boolean;
  lastSeen: number;
}
interface Room {
  id: string;
  serverId: string;
  name: string;
  hostId: string;
  version: number;
  pendingSessionId: string;
  settings: Settings;
  members: Member[];
  state: State | null;
}
export interface RoomView {
  roomId: string;
  serverId: string;
  name: string;
  hostId: string;
  settings: Settings;
  members: { id: string; username: string; ready: boolean; online: boolean }[];
  game: View | null;
}
const RoomSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  name: z.string(),
  hostId: z.string(),
  version: z.number().int(),
  pendingSessionId: z.string().default(""),
  settings: SettingsSchema,
  members: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      ready: z.boolean(),
      lastSeen: z.number(),
    }),
  ),
  state: StateSchema.nullable(),
});
const newRoom = CommandSchema.extend({
  serverId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  settings: SettingsSchema,
}).strict();
const contentWrite = CommandSchema.extend({ content: ContentSchema }).strict();
const contentBatch = CommandSchema.extend({
  items: z.array(ContentSchema).min(1).max(500),
}).strict();
const prefix = "/api/games/durak";
const user = (req: Request) => {
  const u = (req as Request & { user?: { id: string; username: string } }).user;
  if (!u || typeof u.id !== "string" || typeof u.username !== "string")
    throw new GameError(401, "Войдите в аккаунт");
  return u;
};
const param = (req: Request, key: string) => {
  const v = req.params[key];
  if (typeof v !== "string" || v.length > 100)
    throw new GameError(400, "Неверный адрес");
  return v;
};
const uuid = () => globalThis.crypto.randomUUID();
const rng = (n: number) => {
  const buf = new Uint32Array(1);
  const ceiling = 4294967296 - (4294967296 % n);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= ceiling);
  return buf[0] % n;
};
export function register(
  app: Express,
  ctx: ServerContext,
): { tick: () => void; close: () => void } {
  const { db } = ctx;
  let closed = false;
  const rates = new Map<string, { at: number; count: number }>();
  const wrap =
    (fn: (req: Request, res: Response) => void): RequestHandler =>
    (req, res) => {
      try {
        fn(req, res);
      } catch (e) {
        if (e instanceof z.ZodError) {
          res.status(400).json({ error: "Неверный формат запроса" });
          return;
        }
        if (e instanceof GameError) {
          res.status(e.status).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: "Не удалось выполнить операцию" });
      }
    };
  function rate(req: Request) {
    const id = user(req).id,
      now = ctx.now();
    let r = rates.get(id);
    if (!r || now - r.at >= 1000) {
      r = { at: now, count: 0 };
      rates.set(id, r);
    }
    if (++r.count > 25)
      throw new GameError(429, "Слишком много запросов. Подождите секунду.");
    if (rates.size > 10000)
      for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  }
  function membership(serverId: string, id: string) {
    if (
      !db
        .prepare("SELECT 1 FROM server_members WHERE server_id=? AND user_id=?")
        .get(serverId, id)
    )
      throw new GameError(404, "Комната недоступна");
  }
  function read(id: string): Room {
    const row = db
      .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
      .get(id) as { data: string } | undefined;
    if (!row) throw new GameError(404, "Комната недоступна");
    return RoomSchema.parse(JSON.parse(row.data));
  }
  function save(r: Room) {
    db.prepare(
      "INSERT INTO rr_durak_rooms(id,server_id,name,host_id,version,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET host_id=excluded.host_id,version=excluded.version,data=excluded.data",
    ).run(r.id, r.serverId, r.name, r.hostId, r.version, JSON.stringify(r));
    db.prepare("DELETE FROM rr_durak_participants WHERE room_id=?").run(r.id);
    r.members.forEach((m, i) =>
      db
        .prepare(
          "INSERT INTO rr_durak_participants(room_id,server_id,user_id,seat,username,ready,last_seen) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          r.id,
          r.serverId,
          m.id,
          i,
          m.username,
          m.ready ? 1 : 0,
          m.lastSeen,
        ),
    );
    if (r.state) {
      const out = result(r.state);
      if (out) {
        db.prepare(
          "INSERT OR IGNORE INTO rr_durak_results(session_id,room_id,server_id,result,created_at) VALUES(?,?,?,?,?)",
        ).run(out.sessionId, r.id, r.serverId, JSON.stringify(out), ctx.now());
        for (const score of out.scores)
          db.prepare(
            "INSERT OR IGNORE INTO rr_durak_scores(session_id,room_id,server_id,user_id,score) VALUES(?,?,?,?,?)",
          ).run(out.sessionId, r.id, r.serverId, score.userId, score.score);
      }
    }
  }
  function view(r: Room, id: string): RoomView {
    return {
      roomId: r.id,
      serverId: r.serverId,
      name: r.name,
      hostId: r.hostId,
      settings: r.settings,
      members: r.members.map((m) => ({
        id: m.id,
        username: m.username,
        ready: m.ready,
        online: ctx.now() - m.lastSeen < 15000,
      })),
      game: r.state ? project(r.state, id) : null,
    };
  }
  function output(r: Room, id: string, res: Response) {
    res.json({ view: view(r, id), version: r.version, serverNow: ctx.now() });
  }
  function access(req: Request, allowJoin = false) {
    const u = user(req),
      r = read(param(req, "id"));
    membership(r.serverId, u.id);
    if (!allowJoin && !r.members.some((m) => m.id === u.id))
      throw new GameError(404, "Комната недоступна");
    return r;
  }
  function refresh(r: Room): boolean {
    const before = JSON.stringify(r);
    const now = ctx.now();
    if (r.members.length) {
      if (
        r.members.every((m) => now - m.lastSeen >= 600000) &&
        r.state &&
        !r.state.final
      )
        r.state = cancel(r.state);
      const host = r.members.find((m) => m.id === r.hostId);
      if (!host || now - host.lastSeen >= 45000) {
        const successor = r.members.find((m) => now - m.lastSeen < 15000);
        if (successor) r.hostId = successor.id;
      }
    }
    if (r.state && !r.state.final)
      r.state = advance(r.state, { nowMs: now, randomInt: rng });
    if (r.state) r.state.hostId = r.hostId;
    const changed = before !== JSON.stringify(r);
    if (changed) {
      r.version++;
      save(r);
    }
    return changed;
  }
  function refreshCommitted(r: Room) {
    let changed = false;
    transaction(db, () => {
      changed = refresh(r);
    });
    if (changed) ctx.broadcast();
  }
  function remember(id: string, commandId: string, roomId: string) {
    db.prepare(
      "INSERT INTO rr_durak_commands(user_id,command_id,room_id) VALUES(?,?,?)",
    ).run(id, commandId, roomId);
  }
  function command(
    req: Request,
    res: Response,
    fn: (r: Room, body: Record<string, unknown>) => void,
    allowJoin = false,
  ) {
    rate(req);
    const raw = z.record(z.string(), z.unknown()).parse(req.body);
    const cmd = CommandSchema.parse({
      commandId: raw.commandId,
      expectedVersion: raw.expectedVersion,
    });
    let r = access(req, allowJoin);
    const u = user(req);
    refreshCommitted(r);
    let changed = false;
    transaction(db, () => {
      r = read(r.id);
      const previous = db
        .prepare(
          "SELECT room_id FROM rr_durak_commands WHERE user_id=? AND command_id=?",
        )
        .get(u.id, cmd.commandId) as { room_id: string } | undefined;
      if (previous) {
        if (previous.room_id !== r.id)
          throw new GameError(409, "Команда уже использована");
        return;
      }
      if (r.version !== cmd.expectedVersion)
        throw new GameError(409, "Комната изменилась. Обновите состояние.");
      fn(r, raw);
      r.version++;
      save(r);
      remember(u.id, cmd.commandId, r.id);
      changed = true;
    });
    if (changed) ctx.broadcast();
    output(r, u.id, res);
  }
  app.get(
    `${prefix}/rooms`,
    ctx.requireAuth,
    wrap((req, res) => {
      const serverId = z.string().min(1).max(100).parse(req.query.serverId);
      membership(serverId, user(req).id);
      const rows = db
        .prepare("SELECT data FROM rr_durak_rooms WHERE server_id=?")
        .all(serverId) as { data: string }[];
      res.json({
        rooms: rows
          .map((row) => RoomSchema.parse(JSON.parse(row.data)))
          .map((r) => ({
            id: r.id,
            version: r.version,
            name: r.name,
            count: r.members.length,
            maxPlayers: r.settings.maxPlayers,
            phase: r.state?.phase ?? "lobby",
            joined: r.members.some((m) => m.id === user(req).id),
          })),
      });
    }),
  );
  app.post(
    `${prefix}/rooms`,
    ctx.requireAuth,
    wrap((req, res) => {
      rate(req);
      const body = newRoom.parse(req.body),
        u = user(req);
      membership(body.serverId, u.id);
      if (body.expectedVersion !== 0)
        throw new GameError(409, "Неверная версия создания");
      let r: Room;
      let changed = false;
      r = transaction(db, () => {
        const p = db
          .prepare(
            "SELECT room_id FROM rr_durak_commands WHERE user_id=? AND command_id=?",
          )
          .get(u.id, body.commandId) as { room_id: string } | undefined;
        if (p) {
          const existing = read(p.room_id);
          membership(existing.serverId, u.id);
          if (!existing.members.some((m) => m.id === u.id))
            throw new GameError(404, "Комната недоступна");
          return existing;
        }
        const count = db
          .prepare("SELECT id FROM rr_durak_rooms WHERE server_id=?")
          .all(body.serverId).length;
        if (count >= 100)
          throw new GameError(429, "Достигнут лимит комнат сервера");
        const room: Room = {
          id: uuid(),
          serverId: body.serverId,
          name: body.name,
          hostId: u.id,
          version: 1,
          pendingSessionId: uuid(),
          settings: body.settings,
          members: [
            {
              id: u.id,
              username: u.username,
              ready: false,
              lastSeen: ctx.now(),
            },
          ],
          state: null,
        };
        save(room);
        remember(u.id, body.commandId, room.id);
        changed = true;
        return room;
      });
      if (changed) ctx.broadcast();
      output(r, u.id, res);
    }),
  );
  app.get(
    `${prefix}/rooms/:id/view`,
    ctx.requireAuth,
    wrap((req, res) => {
      const r = access(req);
      refreshCommitted(r);
      transaction(db, () => {
        const m = r.members.find((m) => m.id === user(req).id)!;
        m.lastSeen = ctx.now();
        save(r);
      });
      output(r, user(req).id, res);
    }),
  );
  app.post(
    `${prefix}/rooms/:id/join`,
    ctx.requireAuth,
    wrap((req, res) =>
      command(
        req,
        res,
        (r, b) => {
          CommandSchema.parse(b);
          const u = user(req);
          if (r.members.some((m) => m.id === u.id)) return;
          if (r.state) throw new GameError(422, "Партия уже началась");
          if (r.members.length >= r.settings.maxPlayers)
            throw new GameError(422, "В комнате нет мест");
          if (!r.members.length) r.hostId = u.id;
          r.members.push({
            id: u.id,
            username: u.username,
            ready: false,
            lastSeen: ctx.now(),
          });
        },
        true,
      ),
    ),
  );
  app.post(
    `${prefix}/rooms/:id/ready`,
    ctx.requireAuth,
    wrap((req, res) =>
      command(req, res, (r, b) => {
        const body = CommandSchema.extend({ ready: z.boolean() })
          .strict()
          .parse(b);
        if (r.state) throw new GameError(422, "Партия уже началась");
        r.members.find((m) => m.id === user(req).id)!.ready = body.ready;
      }),
    ),
  );
  app.post(
    `${prefix}/rooms/:id/start`,
    ctx.requireAuth,
    wrap((req, res) =>
      command(req, res, (r, b) => {
        CommandSchema.parse(b);
        if (r.hostId !== user(req).id)
          throw new GameError(403, "Начать может только ведущий");
        if (r.state || r.members.length < 2 || r.members.some((m) => !m.ready))
          throw new GameError(422, "Нужны минимум два готовых игрока");
        const snapshot = (
          db.prepare("SELECT record FROM rr_durak_content").all() as {
            record: string;
          }[]
        )
          .map((v) => ContentSchema.parse(JSON.parse(v.record)))
          .filter((c) => c.status === "published");
        r.state = create({
          sessionId: r.pendingSessionId || uuid(),
          hostId: r.hostId,
          participants: r.members.map((m) => ({
            id: m.id,
            username: m.username,
          })),
          settings: r.settings,
          contentSnapshot: snapshot,
          ctx: { nowMs: ctx.now(), randomInt: rng },
        });
      }),
    ),
  );
  app.post(
    `${prefix}/rooms/:id/actions`,
    ctx.requireAuth,
    wrap((req, res) =>
      command(req, res, (r, b) => {
        const body = CommandSchema.extend({ action: ActionSchema })
          .strict()
          .parse(b);
        if (!r.state) throw new GameError(422, "Партия не началась");
        r.state = apply(r.state, body.action, user(req).id, {
          nowMs: ctx.now(),
          randomInt: rng,
        });
      }),
    ),
  );
  app.post(
    `${prefix}/rooms/:id/leave`,
    ctx.requireAuth,
    wrap((req, res) => {
      command(req, res, (r, b) => {
        CommandSchema.parse(b);
        const m = r.members.find((m) => m.id === user(req).id)!;
        if (r.state) {
          m.lastSeen = ctx.now() - 45001;
        } else {
          r.members = r.members.filter((p) => p.id !== m.id);
          if (r.hostId === m.id) r.hostId = r.members[0]?.id ?? "";
        }
      });
    }),
  );
  app.post(
    `${prefix}/rooms/:id/rematch`,
    ctx.requireAuth,
    wrap((req, res) =>
      command(req, res, (r, b) => {
        CommandSchema.parse(b);
        if (r.hostId !== user(req).id)
          throw new GameError(403, "Реванш создаёт ведущий");
        if (!r.state?.final)
          throw new GameError(422, "Партия ещё не закончилась");
        r.state = null;
        r.pendingSessionId = uuid();
        for (const m of r.members) m.ready = false;
      }),
    ),
  );
  const admin = [ctx.requireAuth, ctx.requireRole("admin", "editor")];
  app.get(
    `${prefix}/admin/content`,
    ...admin,
    wrap((_req, res) => {
      res.json({
        items: (
          db.prepare("SELECT record FROM rr_durak_content").all() as {
            record: string;
          }[]
        ).map((r) => ContentSchema.parse(JSON.parse(r.record))),
      });
    }),
  );
  function adminCommand(
    req: Request,
    cmd: { commandId: string; expectedVersion: number },
    fn: () => void,
  ) {
    rate(req);
    const id = user(req).id;
    let changed = false;
    transaction(db, () => {
      const old = db
        .prepare(
          "SELECT room_id FROM rr_durak_commands WHERE user_id=? AND command_id=?",
        )
        .get(id, cmd.commandId) as { room_id: string } | undefined;
      if (old) {
        if (old.room_id !== "@content")
          throw new GameError(409, "Команда уже использована");
        return;
      }
      fn();
      remember(id, cmd.commandId, "@content");
      changed = true;
    });
    if (changed) ctx.broadcast();
  }
  app.post(
    `${prefix}/admin/content`,
    ...admin,
    wrap((req, res) => {
      const body = contentWrite.parse(req.body);
      adminCommand(req, body, () => {
        if (
          body.expectedVersion !== 0 ||
          db
            .prepare("SELECT id FROM rr_durak_content WHERE id=?")
            .get(body.content.id)
        )
          throw new GameError(409, "Запись уже существует");
        db.prepare("INSERT INTO rr_durak_content(id,record) VALUES(?,?)").run(
          body.content.id,
          JSON.stringify({ ...body.content, revision: 1 }),
        );
      });
      res.json({ ok: true });
    }),
  );
  app.put(
    `${prefix}/admin/content/:id`,
    ...admin,
    wrap((req, res) => {
      const body = contentWrite.parse(req.body),
        id = param(req, "id");
      adminCommand(req, body, () => {
        const row = db
          .prepare("SELECT record FROM rr_durak_content WHERE id=?")
          .get(id) as { record: string } | undefined;
        if (!row) throw new GameError(404, "Задание не найдено");
        const old = ContentSchema.parse(JSON.parse(row.record));
        if (body.expectedVersion !== old.revision)
          throw new GameError(409, "Задание изменено");
        if (body.content.id !== id)
          throw new GameError(400, "Идентификатор не совпадает");
        db.prepare("UPDATE rr_durak_content SET record=? WHERE id=?").run(
          JSON.stringify({ ...body.content, revision: old.revision + 1 }),
          id,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.delete(
    `${prefix}/admin/content/:id`,
    ...admin,
    wrap((req, res) => {
      const body = CommandSchema.parse(req.body);
      adminCommand(req, body, () => {
        const row = db
          .prepare("SELECT record FROM rr_durak_content WHERE id=?")
          .get(param(req, "id")) as { record: string } | undefined;
        if (!row) throw new GameError(404, "Задание не найдено");
        if (
          ContentSchema.parse(JSON.parse(row.record)).revision !==
          body.expectedVersion
        )
          throw new GameError(409, "Задание изменено");
        db.prepare("DELETE FROM rr_durak_content WHERE id=?").run(
          param(req, "id"),
        );
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    `${prefix}/admin/content/import`,
    ...admin,
    wrap((req, res) => {
      const body = contentBatch.parse(req.body);
      if (new Set(body.items.map((i) => i.id)).size !== body.items.length)
        throw new GameError(400, "Повтор идентификатора");
      adminCommand(req, body, () => {
        if (body.expectedVersion !== 0)
          throw new GameError(409, "Неверная версия импорта");
        for (const c of body.items) {
          if (
            db.prepare("SELECT id FROM rr_durak_content WHERE id=?").get(c.id)
          )
            throw new GameError(
              409,
              "Импорт содержит существующий идентификатор",
            );
          db.prepare("INSERT INTO rr_durak_content(id,record) VALUES(?,?)").run(
            c.id,
            JSON.stringify({ ...c, revision: 1 }),
          );
        }
      });
      res.json({ ok: true });
    }),
  );
  return {
    tick() {
      if (closed) return;
      const rows = db.prepare("SELECT data FROM rr_durak_rooms").all() as {
        data: string;
      }[];
      let changed = false;
      for (const row of rows)
        transaction(db, () => {
          const r = RoomSchema.parse(JSON.parse(row.data));
          if (refresh(r)) changed = true;
        });
      if (changed) ctx.broadcast();
    },
    close() {
      closed = true;
      rates.clear();
    },
  };
}
export function getNextDeadline(db: DB, nowMs = Date.now()): number | null {
  const rows = db.prepare("SELECT data FROM rr_durak_rooms").all() as {
    data: string;
  }[];
  let min = Infinity;
  for (const row of rows) {
    const r = RoomSchema.parse(JSON.parse(row.data));
    if (r.state && !r.state.final) {
      const d = nextDeadline(r.state);
      if (d !== null) min = Math.min(min, d);
      min = Math.min(
        min,
        Math.max(...r.members.map((m) => m.lastSeen)) + 600000,
      );
      const h = r.members.find((m) => m.id === r.hostId);
      if (
        h &&
        r.members.some((m) => m.id !== h.id && nowMs - m.lastSeen < 15000)
      )
        min = Math.min(min, Math.max(nowMs, h.lastSeen + 45000));
    }
  }
  return Number.isFinite(min) ? min : null;
}
