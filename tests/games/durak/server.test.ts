import { beforeEach, afterEach, describe, it, expect } from "vitest";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
let testDirectory: string;
let databasePath: string;
import type { RequestHandler } from "express";
import type { Server } from "node:http";
import { openDB } from "./storage";
import {
  migrate,
  register,
  getNextDeadline,
} from "../../../server/games/durak";
import type { RoomView } from "../../../server/games/durak/routes";
import type { State } from "../../../shared/games/durak/types";
import { demoContent } from "./fixtures";
import { project } from "../../../server/games/durak/engine";
let db: ReturnType<typeof openDB>,
  server: Server,
  base: string,
  clock: number,
  controller: ReturnType<typeof register>,
  broadcasts: number;
interface Reply {
  view: RoomView;
  version: number;
  serverNow: number;
  error?: string;
  rooms?: { id: string; version: number }[];
  items?: unknown[];
}
async function req(path: string, id = "p0", method = "GET", body?: unknown) {
  const r = await fetch(base + "/api/games/durak" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(id ? { "X-User": id } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as Reply };
}
const cmd = (expectedVersion: number, extra: Record<string, unknown> = {}) => ({
  commandId: crypto.randomUUID(),
  expectedVersion,
  ...extra,
});
async function room(n = 2, edu = false) {
  let r = await req(
    "/rooms",
    "p0",
    "POST",
    cmd(0, {
      serverId: "s1",
      name: "Тест",
      settings: { maxPlayers: 6, educational: edu, ruleIds: [] },
    }),
  );
  for (let i = 1; i < n; i++)
    r = await req(
      `/rooms/${r.body.view.roomId}/join`,
      `p${i}`,
      "POST",
      cmd(r.body.version),
    );
  return r.body;
}
async function start(n = 2, edu = false) {
  let r = await room(n, edu);
  for (let i = 0; i < n; i++)
    r = (
      await req(
        `/rooms/${r.view.roomId}/ready`,
        `p${i}`,
        "POST",
        cmd(r.version, { ready: true }),
      )
    ).body;
  r = (await req(`/rooms/${r.view.roomId}/start`, "p0", "POST", cmd(r.version)))
    .body;
  clock += 501;
  return (await req(`/rooms/${r.view.roomId}/view`)).body;
}
beforeEach(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "rr-durak-test-"));
  databasePath = join(testDirectory, "test.sqlite");
  db = openDB(databasePath);
  clock = 10000;
  broadcasts = 0;
  db.exec(
    "CREATE TABLE server_members(server_id TEXT,user_id TEXT,PRIMARY KEY(server_id,user_id))",
  );
  for (let i = 0; i < 8; i++)
    db.prepare("INSERT INTO server_members VALUES(?,?)").run(
      i === 7 ? "s2" : "s1",
      `p${i}`,
    );
  migrate(db);
  for (const c of demoContent)
    db.prepare("INSERT INTO rr_durak_content VALUES(?,?)").run(
      c.id,
      JSON.stringify(c),
    );
  const app = express();
  app.use(express.json());
  const auth: RequestHandler = (q, r, next) => {
    const id = q.header("X-User");
    if (!id) {
      r.status(401).json({ error: "Войдите" });
      return;
    }
    (q as typeof q & { user: { id: string; username: string } }).user = {
      id,
      username: id, email: "test@example.test", role: "player", xp: 0, avatar: "", createdAt: "2026-10-31",
    };
    next();
  };
  controller = register(app, {
    db,
    requireAuth: auth,
    requireRole: () => (q, r, next) => {
      if (q.header("X-User") !== "p6") {
        r.status(403).json({ error: "Нет прав" });
        return;
      }
      next();
    },
    now: () => clock,
    broadcast: () => {
      expect(
        db.prepare("SELECT count(*) AS n FROM rr_durak_commands").get(),
      ).toBeTruthy();
      broadcasts++;
    },
  });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Нет порта");
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  controller.close();
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});
describe("HTTP, доступ и хранение", () => {
  it("после физического закрытия и открытия файла БД новый контроллер восстанавливает таймер", async () => {
    const r = await start();
    const id = r.view.roomId;
    const deadline = r.view.game!.deadline!;
    controller.close();
    db.close();
    db = openDB(databasePath);
    migrate(db);
    expect(getNextDeadline(db, clock)).toBe(deadline);
    const pass: RequestHandler = (_q, _r, next) => next();
    controller = register(express(), {
      db,
      requireAuth: pass,
      requireRole: () => pass,
      now: () => clock,
      broadcast: () => {},
    });
    clock = deadline;
    controller.tick();
    const row = db
      .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
      .get(id) as { data: string };
    const restored = (JSON.parse(row.data) as { state: State }).state;
    expect(restored.phase).toBe("defend");
    expect(restored.table).toHaveLength(1);
    expect(restored.deadline).toBe(deadline + 25000);
  });

  it("аноним 401, чужой сервер и посторонний 404, редактор защищён", async () => {
    const r = await room();
    const path = `/rooms/${r.view.roomId}/view`;
    expect((await req(path, "")).status).toBe(401);
    expect((await req(path, "p7")).status).toBe(404);
    expect((await req(path, "p2")).status).toBe(404);
    expect((await req("/admin/content", "p0")).status).toBe(403);
    expect((await req("/admin/content", "p6")).status).toBe(200);
  });
  it("создание идемпотентно по commandId", async () => {
    const body = cmd(0, {
      serverId: "s1",
      name: "Повтор",
      settings: { maxPlayers: 2, educational: false, ruleIds: [] },
    });
    const a = await req("/rooms", "p0", "POST", body),
      b = await req("/rooms", "p0", "POST", body);
    expect(a.body.view.roomId).toBe(b.body.view.roomId);
    expect((await req("/rooms")).status).toBe(400);
    expect(db.prepare("SELECT id FROM rr_durak_rooms").all()).toHaveLength(1);
  });
  it("гонка одной version: одна команда успешна, другая 409; повтор не меняет version", async () => {
    const r = await room(),
      path = `/rooms/${r.view.roomId}/ready`,
      body = cmd(r.version, { ready: true });
    const replies = await Promise.all([
      req(path, "p0", "POST", body),
      req(path, "p1", "POST", cmd(r.version, { ready: true })),
    ]);
    expect(replies.map((v) => v.status).sort()).toEqual([200, 409]);
    const repeated = await req(path, "p0", "POST", body);
    expect(repeated.status).toBe(200);
    expect(repeated.body.version).toBe(r.version + 1);
  });
  it("старт только ведущим, все готовы, вход после старта запрещён", async () => {
    let r = await room();
    let p = `/rooms/${r.view.roomId}`;
    expect((await req(p + "/start", "p1", "POST", cmd(r.version))).status).toBe(
      403,
    );
    expect((await req(p + "/start", "p0", "POST", cmd(r.version))).status).toBe(
      422,
    );
    r = (await req(p + "/ready", "p0", "POST", cmd(r.version, { ready: true })))
      .body;
    r = (await req(p + "/ready", "p1", "POST", cmd(r.version, { ready: true })))
      .body;
    r = (await req(p + "/start", "p0", "POST", cmd(r.version))).body;
    expect(r.view.game?.phase).toBe("dealing");
    expect((await req(p + "/join", "p2", "POST", cmd(r.version))).status).toBe(
      422,
    );
  });
  it("максимум 6 игроков; седьмой не входит", async () => {
    const r = await room(6);
    expect(r.view.members).toHaveLength(6);
    expect(
      (await req(`/rooms/${r.view.roomId}/join`, "p6", "POST", cmd(r.version)))
        .status,
    ).toBe(422);
  });
  it("отклонённый ход не меняет БД и не broadcast", async () => {
    const r = await start();
    const before = db
      .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
      .get(r.view.roomId);
    const b = broadcasts;
    const actor = r.view.game!.turnId;
    const bad = await req(
      `/rooms/${r.view.roomId}/actions`,
      actor,
      "POST",
      cmd(r.version, {
        action: { type: "attack", card: { suit: "clubs", rank: 99 } },
      }),
    );
    expect(bad.status).toBe(400);
    expect(
      db
        .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
        .get(r.view.roomId),
    ).toEqual(before);
    expect(broadcasts).toBe(b);
    const pass = await req(
      `/rooms/${r.view.roomId}/actions`,
      actor,
      "POST",
      cmd(r.version, { action: { type: "pass" } }),
    );
    expect(pass.status).toBe(422);
    expect(
      db
        .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
        .get(r.view.roomId),
    ).toEqual(before);
  });
  it("rollback при сбое записи не оставляет частичной команды", async () => {
    const r = await room();
    db.exec(
      "CREATE TRIGGER rr_durak_test_fail BEFORE INSERT ON rr_durak_commands BEGIN SELECT RAISE(ABORT,'test'); END;",
    );
    const before = db
      .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
      .get(r.view.roomId);
    expect(
      (
        await req(
          `/rooms/${r.view.roomId}/ready`,
          "p0",
          "POST",
          cmd(r.version, { ready: true }),
        )
      ).status,
    ).toBe(500);
    expect(
      db
        .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
        .get(r.view.roomId),
    ).toEqual(before);
  });
  it("миграция идемпотентна, данные не удаляются", async () => {
    await room();
    migrate(db);
    migrate(db);
    expect(db.prepare("SELECT id FROM rr_durak_rooms").all()).toHaveLength(1);
  });
  it("View и список не содержат скрытые поля; игрок другой комнаты не читает", async () => {
    const r = await start();
    const raw = JSON.stringify(r);
    for (const word of [
      "acceptedAnswers",
      "contentSnapshot",
      '"deck":',
      '"state":',
      "lastThrower",
    ])
      expect(raw).not.toContain(word);
    expect(r.view.game!.players.every((p) => !("hand" in p))).toBe(true);
    const list = await req("/rooms?serverId=s1");
    for (const word of ["hand", "trump", "contentSnapshot"])
      expect(JSON.stringify(list.body)).not.toContain(word);
    expect((await req(`/rooms/${r.view.roomId}/view`, "p2")).status).toBe(404);
  });
  it("редактирование и удаление каталога не меняет snapshot партии", async () => {
    const r = await start(2, true);
    const before = db
      .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
      .get(r.view.roomId) as { data: string };
    const old = (JSON.parse(before.data) as { state: State }).state
      .contentSnapshot;
    const edited = { ...demoContent[0], prompt: "Новая формулировка" };
    expect(
      (
        await req(
          "/admin/content/" + edited.id,
          "p6",
          "PUT",
          cmd(1, { content: edited }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await req("/admin/content/" + edited.id, "p6", "DELETE", cmd(2))).status,
    ).toBe(200);
    const after = db
      .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
      .get(r.view.roomId) as { data: string };
    expect(
      (JSON.parse(after.data) as { state: State }).state.contentSnapshot,
    ).toEqual(old);
  });
  it("импорт атомарен, статусы и revision проверяются", async () => {
    const a = { ...demoContent[0], id: "new-a" },
      b = demoContent[1];
    expect(
      (
        await req(
          "/admin/content/import",
          "p6",
          "POST",
          cmd(0, { items: [a, b] }),
        )
      ).status,
    ).toBe(409);
    expect(
      db.prepare("SELECT id FROM rr_durak_content WHERE id=?").get("new-a"),
    ).toBeUndefined();
    expect(
      (await req("/admin/content", "p6", "POST", cmd(0, { content: a })))
        .status,
    ).toBe(200);
    expect(
      (await req("/admin/content/new-a", "p6", "PUT", cmd(0, { content: a })))
        .status,
    ).toBe(409);
  });
  it("восстанавливает deadline из БД, финал сохраняет один раз, реванш сохраняет историю", async () => {
    let r = await start();
    const id = r.view.roomId,
      session = r.view.game!.sessionId;
    expect(getNextDeadline(db)).toBe(r.view.game!.deadline);
    controller.close();
    controller = register(express(), {
      db,
      requireAuth: (_q, _r, n) => n(),
      requireRole: () => (_q, _r, n) => n(),
      now: () => clock,
      broadcast: () => {},
    });
    clock += 100000000;
    controller.tick();
    controller.tick();
    const rows = db
      .prepare("SELECT result FROM rr_durak_results WHERE session_id=?")
      .all(session);
    expect(rows).toHaveLength(1);
    r = (await req(`/rooms/${id}/view`)).body;
    expect(r.view.game!.final).not.toBeNull();
    r = (
      await req(`/rooms/${id}/rematch`, r.view.hostId, "POST", cmd(r.version))
    ).body;
    expect(r.view.game).toBeNull();
    expect(r.view.members.every((m) => !m.ready)).toBe(true);
    expect(
      db.prepare("SELECT session_id FROM rr_durak_results").all(),
    ).toHaveLength(1);
  });
  it("передача ведущего через 45 секунд, отмена всех отсутствующих через 10 минут", async () => {
    let r = await start();
    const id = r.view.roomId;
    clock += 44000;
    await req(`/rooms/${id}/view`, "p1");
    clock += 1001;
    controller.tick();
    r = (await req(`/rooms/${id}/view`, "p1")).body;
    expect(r.view.hostId).toBe("p1");
    clock += 600001;
    controller.tick();
    r = (await req(`/rooms/${id}/view`, "p1")).body;
    expect(r.view.game!.final?.outcome).toBe("cancelled");
  });
  it("просроченная версия не повторяет ход после advance; ответ на границе просрочен", async () => {
    const r = await start();
    clock = r.view.game!.deadline!;
    const v = r.view.game!;
    const reply = await req(
      `/rooms/${r.view.roomId}/actions`,
      v.turnId,
      "POST",
      cmd(r.version, {
        action: {
          type: "attack",
          card: project(
            (
              JSON.parse(
                (
                  db
                    .prepare("SELECT data FROM rr_durak_rooms WHERE id=?")
                    .get(r.view.roomId) as { data: string }
                ).data,
              ) as { state: State }
            ).state,
            v.turnId,
          ).hand[0],
        },
      }),
    );
    expect(reply.status).toBe(409);
  });
  it("частота ограничена 429", async () => {
    const r = await room();
    let hit = false;
    for (let i = 0; i < 28; i++) {
      const reply = await req(
        `/rooms/${r.view.roomId}/ready`,
        "p0",
        "POST",
        cmd(0, { ready: true }),
      );
      if (reply.status === 429) hit = true;
    }
    expect(hit).toBe(true);
  });
});
