import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "../../../server/games/impostor/index";
import { draftFromBaseTasks } from "../../../server/games/impostor/content";
import { parseBaseTask, TIMINGS, type BaseTask } from "../../../shared/games/impostor/types";
import { command, CONTENT, http, lobbyWith, openDb, pair, PLAYERS, seedPairs, startServer, uuid, type TestServer } from "./helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

async function startedRoom(n = 4): Promise<{ s: TestServer; roomId: string }> {
  // randomInt всегда 0: пара p1, самозванец u1, сторона a; порядок перемешивания детерминирован.
  const s = await startServer();
  server = s;
  await seedPairs(s);
  const roomId = await lobbyWith(s, n);
  const started = await command(s, "u1", roomId, "start");
  expect(started.status).toBe(200);
  return { s, roomId };
}

function count(s: TestServer, table: string): number {
  const row = s.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return Number(row.c);
}

describe("доступ", () => {
  it("аноним получает 401", async () => {
    const { s, roomId } = await startedRoom();
    expect((await http(s, null, "GET", `/rooms/${roomId}/view`)).status).toBe(401);
    expect((await http(s, null, "GET", "/rooms?serverId=srv")).status).toBe(401);
    expect((await http(s, null, "POST", "/rooms", { serverId: "srv", name: "x", commandId: uuid(), expectedVersion: 0 })).status).toBe(401);
  });

  it("пользователь другого сервера не видит комнату и список", async () => {
    const { s, roomId } = await startedRoom();
    const view = await http(s, "stranger", "GET", `/rooms/${roomId}/view`);
    expect(view.status).toBe(404);
    expect(view.raw).not.toContain("Альфа");
    expect((await http(s, "stranger", "GET", "/rooms?serverId=srv")).status).toBe(403);
    expect((await http(s, "stranger", "POST", "/rooms", { serverId: "srv", name: "x", commandId: uuid(), expectedVersion: 0 })).status).toBe(403);
  });

  it("участник другой комнаты и зритель не могут ходить и не видят тем", async () => {
    const { s, roomId } = await startedRoom();
    const spectatorView = await http(s, "u9", "GET", `/rooms/${roomId}/view`);
    expect(spectatorView.status).toBe(200);
    expect(spectatorView.body.view).toMatchObject({ isParticipant: false, myTopic: null });
    expect(spectatorView.raw).not.toMatch(/Альфа p1|Бета p1|impostorId|state_json|forbidden/);
    const act = await http(s, "u9", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: spectatorView.body.version, action: { type: "vote", targetId: "u1" } });
    expect(act.status).toBe(403);
    const join = await http(s, "u9", "POST", `/rooms/${roomId}/join`, { commandId: uuid(), expectedVersion: spectatorView.body.version });
    expect(join.status).toBe(422);
  });

  it("выбывший видит только свою проекцию и не действует", async () => {
    const { s, roomId } = await startedRoom(5);
    expect((await command(s, "u5", roomId, "leave")).status).toBe(200);
    const view = await http(s, "u5", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ isParticipant: false });
    expect((await command(s, "u5", roomId, "actions", { action: { type: "chat", text: "я тут" } })).status).toBe(403);
  });

  it("игрок не может редактировать контент, редактор может", async () => {
    const s = await startServer();
    server = s;
    expect((await http(s, "u1", "GET", "/admin/content")).status).toBe(403);
    expect((await http(s, "u1", "POST", "/admin/content", { item: pair("x") })).status).toBe(403);
    expect((await http(s, "editor", "GET", "/admin/content")).status).toBe(200);
  });

  it("ни один ответ участнику до финала не содержит чужой темы, роли или скрытых данных", async () => {
    const { s, roomId } = await startedRoom(4);
    for (const p of PLAYERS.slice(0, 4)) {
      const reply = await http(s, p.id, "GET", `/rooms/${roomId}/view`);
      const own = (reply.body.view as { myTopic: { title: string } }).myTopic.title;
      const other = own === "Альфа p1" ? "Бета p1" : "Альфа p1";
      expect(reply.raw).not.toContain(other);
      expect(reply.raw).not.toMatch(/"role"|impostorId|impostorSide|forbiddenWords|"content"|"pairs"|state_json/);
    }
    const list = await http(s, "u2", "GET", "/rooms?serverId=srv");
    expect(list.raw).not.toMatch(/Альфа|Бета|sessionId|state/);
  });
});

describe("команды, версии и гонки", () => {
  it("формат, неизвестное действие и маршрутные команды через /actions — 400", async () => {
    const { s, roomId } = await startedRoom();
    const v = (await http(s, "u1", "GET", `/rooms/${roomId}/view`)).body.version;
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: "nope", expectedVersion: v, action: { type: "chat", text: "x" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "hack" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "start" } })).status).toBe(400);
    expect((await http(s, "u1", "GET", "/rooms/bad%20id/view")).status).toBe(404);
  });

  it("два действия на одну версию: второе получает 409 и ничего не меняет", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += TIMINGS.dealMs;
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const turn = String((base.body.view as { currentTurnId: string }).currentTurnId);
    const first = await http(s, turn, "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "example", text: "первый" } });
    const second = await http(s, turn, "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "example", text: "второй" } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    const after = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect((after.body.view as { examples: { text: string }[] }).examples.map((e) => e.text)).toEqual(["первый"]);
  });

  it("повтор commandId не повторяет действие и возвращает актуальный view", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += TIMINGS.dealMs;
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const turn = String((base.body.view as { currentTurnId: string }).currentTurnId);
    const body = { commandId: uuid(), expectedVersion: base.body.version, action: { type: "example", text: "единожды" } };
    const first = await http(s, turn, "POST", `/rooms/${roomId}/actions`, body);
    const replay = await http(s, turn, "POST", `/rooms/${roomId}/actions`, body);
    expect(replay.status).toBe(200);
    expect(replay.body.version).toBe(first.body.version);
    expect((replay.body.view as { examples: unknown[] }).examples).toHaveLength(1);
  });

  it("отклонённый ход (422) не меняет состояние и версию", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += TIMINGS.dealMs;
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const turn = String((base.body.view as { currentTurnId: string }).currentTurnId);
    const notTurn = PLAYERS.slice(0, 4).find((p) => p.id !== turn)?.id ?? "u2";
    const bad = await http(s, notTurn, "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "example", text: "чужой" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatch(/[а-я]/i);
    expect((await http(s, "u1", "GET", `/rooms/${roomId}/view`)).body.version).toBe(base.body.version);
  });

  it("отказ транзакции не оставляет частичной записи", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += TIMINGS.dealMs;
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const turn = String((base.body.view as { currentTurnId: string }).currentTurnId);
    const commands = count(s, "rr_impostor_commands");
    const original = s.db.prepare.bind(s.db);
    s.db.prepare = (sql: string) => {
      if (sql.startsWith("INSERT INTO rr_impostor_commands")) throw new Error("диск переполнен");
      return original(sql);
    };
    const failed = await http(s, turn, "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "example", text: "сломается" } });
    s.db.prepare = original;
    expect(failed.status).toBe(500);
    expect(failed.raw).not.toContain("диск");
    const after = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(after.body.version).toBe(base.body.version);
    expect((after.body.view as { examples: unknown[] }).examples).toHaveLength(0);
    expect(count(s, "rr_impostor_commands")).toBe(commands);
  });

  it("граница nowMs === deadline: ход на дедлайне не принимается", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += TIMINGS.dealMs;
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const view = base.body.view as { currentTurnId: string; deadline: number };
    s.clock.now = view.deadline;
    const late = await http(s, view.currentTurnId, "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "example", text: "поздно" } });
    expect(late.status).not.toBe(200);
    const after = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect((after.body.view as { examples: { text: string }[] }).examples[0]?.text).toBe("Пропуск");
  });

  it("частота: больше 10 команд в секунду — 429", async () => {
    const { s, roomId } = await startedRoom();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await http(s, "u3", "POST", `/rooms/${roomId}/ready`, { commandId: uuid(), expectedVersion: 0, ready: true })).status);
    }
    expect(statuses).toContain(429);
  });

  it("maxPlayers: 16 входят через API, 17-й получает 422", async () => {
    const s = await startServer();
    server = s;
    await seedPairs(s);
    const roomId = await lobbyWith(s, 16);
    const extra = await command(s, "u17", roomId, "join");
    expect(extra.status).toBe(422);
    expect(extra.body.error).toContain("16");
    expect((await command(s, "u1", roomId, "start")).status).toBe(200);
  });
});

describe("хранение", () => {
  it("результат сохраняется ровно один раз, повторная финализация ничего не начисляет", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += 3_600_000;
    s.registration.tick();
    s.registration.tick();
    await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect(count(s, "rr_impostor_results")).toBe(1);
    expect(count(s, "rr_impostor_scores")).toBe(4);
    const view = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view?.phase).toBe("finished");
  });

  it("реванш создаёт новую сессию и сохраняет историю", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += 3_600_000;
    const finished = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect((await command(s, "u2", roomId, "rematch")).status).toBe(403);
    const rematch = await command(s, "u1", roomId, "rematch");
    expect(rematch.status).toBe(200);
    expect(rematch.body.view).toMatchObject({ phase: "lobby" });
    expect((rematch.body.view as { sessionId: string }).sessionId).not.toBe((finished.body.view as { sessionId: string }).sessionId);
    expect(count(s, "rr_impostor_sessions")).toBe(2);
  });

  it("все отсутствуют 10 минут: вернувшийся игрок не отменяет уже наступившую отмену", async () => {
    const s = await startServer();
    server = s;
    await seedPairs(s);
    const roomId = await lobbyWith(s, 4);
    s.clock.now += 11 * 60_000;
    const view = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ phase: "cancelled" });
    const list = await http(s, "u2", "GET", "/rooms?serverId=srv");
    expect((list.body.rooms as { id: string }[]).some((r) => r.id === roomId)).toBe(false);
  });

  it("миграция идемпотентна и не удаляет данные", async () => {
    const { s } = await startedRoom();
    const rooms = count(s, "rr_impostor_rooms");
    migrate(s.db);
    migrate(s.db);
    expect(count(s, "rr_impostor_rooms")).toBe(rooms);
    const meta = s.db.prepare("SELECT value FROM rr_impostor_meta WHERE key = 'schemaVersion'").get() as { value: string };
    expect(meta.value).toBe("1");
  });

  it("правка и удаление контента после старта не ломают текущую партию", async () => {
    const { s, roomId } = await startedRoom();
    const list = await http(s, "editor", "GET", "/admin/content");
    const row = (list.body.items as { id: string; revision: number; item: { id: string } }[]).find((r) => r.item.id === "p1");
    if (!row) throw new Error("нет p1");
    const changed = await http(s, "editor", "PUT", `/admin/content/${row.id}`, { item: { ...pair("p1"), a: { ...pair("p1").a, title: "Изменённая" } }, expectedRevision: row.revision });
    expect(changed.status).toBe(200);
    const after = await http(s, "editor", "GET", "/admin/content");
    const fresh = (after.body.items as { id: string; revision: number }[]).find((r) => r.id === row.id);
    expect((await http(s, "editor", "DELETE", `/admin/content/${row.id}?expectedRevision=${fresh?.revision}`)).status).toBe(200);
    s.clock.now += 3_600_000;
    const final = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect(final.body.view?.phase).toBe("finished");
    expect(final.raw).toContain("Альфа p1");
    expect(final.raw).not.toContain("Изменённая");
  });

  it("дедлайн восстанавливается из БД после рестарта", async () => {
    const db = openDb();
    const first = await startServer({ db });
    server = first;
    await seedPairs(first);
    const roomId = await lobbyWith(first, 4);
    await command(first, "u1", roomId, "start");
    const deadline = first.registration.nextWakeAt();
    await first.close();
    const second = await startServer({ db, now: first.clock.now });
    server = second;
    expect(second.registration.nextWakeAt()).toBe(deadline);
    second.clock.now += TIMINGS.dealMs;
    second.registration.tick();
    const view = await http(second, "u1", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view?.phase).toBe("examples");
    expect(second.broadcasts.count).toBeGreaterThan(0);
  });
});

describe("контент", () => {
  it("публикация требует корректной записи, импорт сохраняет ошибки черновиками", async () => {
    const s = await startServer();
    server = s;
    const broken = { ...pair("bad"), a: { ...pair("bad").a, examples: ["альфа один", "два", "три"] } };
    const report = await http(s, "editor", "POST", "/admin/content/import", { items: [{ status: "published", item: broken }, { status: "published", item: pair("ok") }] });
    expect(report.body).toMatchObject({ created: 2, published: 1 });
    const created = await http(s, "editor", "POST", "/admin/content", { item: broken });
    const id = String(created.body.id);
    const publish = await http(s, "editor", "POST", `/admin/content/${id}/status`, { status: "published", expectedRevision: 1 });
    expect(publish.status).toBe(422);
    const stale = await http(s, "editor", "PUT", `/admin/content/${id}`, { item: pair("ok2"), expectedRevision: 7 });
    expect(stale.status).toBe(409);
    const exported = await http(s, "editor", "GET", "/admin/content/export");
    expect((exported.body.items as unknown[]).length).toBe(3);
    const catalog = await http(s, "u1", "GET", "/catalog");
    expect(catalog.body).toMatchObject({ publishedCount: 1, enoughContent: true });
    expect(catalog.raw).not.toContain("Альфа");
  });

  it("авторский набор: 13 пар без ошибок проверки", async () => {
    const s = await startServer();
    server = s;
    const seed = JSON.parse(fs.readFileSync(path.join(here, "../../../server/games/impostor/content/pairs.seed.json"), "utf8")) as { items: unknown[] };
    expect(seed.items.length).toBeGreaterThanOrEqual(12);
    const report = await http(s, "editor", "POST", "/admin/content/import", { items: seed.items.map((item) => ({ status: "published", item })) });
    expect(report.body).toMatchObject({ published: seed.items.length, rejected: [], drafts: [] });
    const list = await http(s, "editor", "GET", "/admin/content");
    const warnings = (list.body.items as { review: { warnings: string[] } }[]).flatMap((row) => row.review.warnings);
    expect(warnings).toEqual([]);
  });

  it("адаптер учебных заданий собирает черновик пары только из опубликованных заданий", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(here, "base-tasks.json"), "utf8")) as { tasks: unknown[] };
    const tasks = fixture.tasks.map((raw) => {
      const parsed = parseBaseTask(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.value;
    });
    const byRule = (rule: string): BaseTask[] => tasks.filter((t) => t.ruleId === rule);
    const draft = draftFromBaseTasks(
      { title: "Разделительный Ъ", tasks: byRule("rule-hard-sign") },
      { title: "Разделительный Ь", tasks: byRule("rule-soft-sign") },
      "Ъ — после приставки, Ь — в корне и перед окончанием.",
    );
    expect(draft.ok).toBe(true);
    if (draft.ok) {
      expect(draft.value.a.examples).toEqual(["подъезд", "объявление", "съёмка"]);
      expect(JSON.stringify(draft.value)).not.toContain("скрытое");
    }
    expect(CONTENT.pairs).toHaveLength(3);
  });
});
