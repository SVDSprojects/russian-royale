import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "../../../server/games/whoami/index";
import { draftFromBaseTask } from "../../../server/games/whoami/content";
import { parseBaseTask, TIMINGS } from "../../../shared/games/whoami/types";
import { command, http, lobbyWith, openDb, PLAYERS, seedTerms, startServer, term, TERMS, uuid, type TestServer } from "./helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

/** Партия в фазе вопроса: randomInt = max − 1, поэтому u1 → «Термин t01», u2 → t02 …, ходит u1. */
async function askingRoom(n = 3): Promise<{ s: TestServer; roomId: string }> {
  const s = await startServer();
  server = s;
  await seedTerms(s);
  const roomId = await lobbyWith(s, n);
  expect((await command(s, "u1", roomId, "start")).status).toBe(200);
  s.clock.now += TIMINGS.assignMs;
  return { s, roomId };
}

/** Игроки остаются на месте: время идёт шагами по 150 с, и каждый заходит в комнату. */
async function playOut(s: TestServer, roomId: string, n = 3): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    s.clock.now += 150_000;
    for (const p of PLAYERS.slice(0, n)) await http(s, p.id, "GET", `/rooms/${roomId}/view`);
  }
}

function count(s: TestServer, table: string): number {
  const row = s.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return Number(row.c);
}

const SECRET_KEYS = /acceptedAnswers|equivalenceYo|"termId"|"votes"|state_json|"content"|"terms"|вариант t/;

describe("доступ", () => {
  it("аноним получает 401", async () => {
    const { s, roomId } = await askingRoom();
    expect((await http(s, null, "GET", `/rooms/${roomId}/view`)).status).toBe(401);
    expect((await http(s, null, "GET", "/rooms?serverId=srv")).status).toBe(401);
    expect((await http(s, null, "POST", "/rooms", { serverId: "srv", name: "x", commandId: uuid(), expectedVersion: 0 })).status).toBe(401);
  });

  it("пользователь другого сервера не видит комнату и список", async () => {
    const { s, roomId } = await askingRoom();
    const view = await http(s, "stranger", "GET", `/rooms/${roomId}/view`);
    expect(view.status).toBe(404);
    expect(view.raw).not.toContain("Термин");
    expect((await http(s, "stranger", "GET", "/rooms?serverId=srv")).status).toBe(403);
  });

  it("зритель и участник другой комнаты не ходят и не видят неугаданных терминов", async () => {
    const { s, roomId } = await askingRoom();
    const spectator = await http(s, "u9", "GET", `/rooms/${roomId}/view`);
    expect(spectator.status).toBe(200);
    expect(spectator.body.view).toMatchObject({ isParticipant: false });
    expect(spectator.raw).not.toMatch(/Термин t0/);
    const act = await http(s, "u9", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: spectator.body.version, action: { type: "ask", text: "Я?" } });
    expect(act.status).toBe(403);
    expect((await http(s, "u9", "POST", `/rooms/${roomId}/join`, { commandId: uuid(), expectedVersion: spectator.body.version })).status).toBe(422);
  });

  it("выбывший видит только свою проекцию и не действует", async () => {
    const { s, roomId } = await askingRoom(4);
    expect((await command(s, "u4", roomId, "leave")).status).toBe(200);
    const view = await http(s, "u4", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ isParticipant: false });
    expect(view.raw).not.toContain("Термин t04");
    expect((await command(s, "u4", roomId, "actions", { action: { type: "answer", answer: "yes" } })).status).toBe(403);
  });

  it("игрок не может редактировать контент, редактор может", async () => {
    const s = await startServer();
    server = s;
    expect((await http(s, "u1", "GET", "/admin/content")).status).toBe(403);
    expect((await http(s, "u1", "POST", "/admin/content", { item: term("x01") })).status).toBe(403);
    expect((await http(s, "editor", "GET", "/admin/content")).status).toBe(200);
  });

  it("ответ участнику не содержит своего термина и вариантов, но содержит чужие термины", async () => {
    const { s, roomId } = await askingRoom(3);
    for (const [index, p] of PLAYERS.slice(0, 3).entries()) {
      const reply = await http(s, p.id, "GET", `/rooms/${roomId}/view`);
      const own = `Термин t0${index + 1}`;
      expect(reply.raw).not.toContain(own);
      expect(reply.raw).not.toMatch(SECRET_KEYS);
      for (const [other] of PLAYERS.slice(0, 3).entries()) if (other !== index) expect(reply.raw).toContain(`Термин t0${other + 1}`);
    }
    const list = await http(s, "u2", "GET", "/rooms?serverId=srv");
    expect(list.raw).not.toMatch(/Термин|sessionId|state/);
  });
});

describe("команды, версии и гонки", () => {
  it("формат, неизвестное действие и маршрутные команды через /actions — 400", async () => {
    const { s, roomId } = await askingRoom();
    const v = (await http(s, "u1", "GET", `/rooms/${roomId}/view`)).body.version;
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: "nope", expectedVersion: v, action: { type: "ask", text: "x" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "answer", answer: "maybe" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "start" } })).status).toBe(400);
    expect((await http(s, "u1", "GET", "/rooms/bad%20id/view")).status).toBe(404);
  });

  it("два действия на одну версию: второе получает 409 и ничего не меняет", async () => {
    const { s, roomId } = await askingRoom();
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const first = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "ask", text: "Я часть речи?" } });
    const second = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "ask", text: "Другой вопрос?" } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    const after = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect((after.body.view as { turn: { question: string } }).turn.question).toBe("Я часть речи?");
  });

  it("повтор commandId не повторяет действие и возвращает актуальный view", async () => {
    const { s, roomId } = await askingRoom();
    await command(s, "u1", roomId, "actions", { action: { type: "ask", text: "Я буква?" } });
    const base = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    const body = { commandId: uuid(), expectedVersion: base.body.version, action: { type: "answer", answer: "no" } };
    const first = await http(s, "u2", "POST", `/rooms/${roomId}/actions`, body);
    const replay = await http(s, "u2", "POST", `/rooms/${roomId}/actions`, body);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.version).toBe(first.body.version);
    expect((replay.body.view as { turn: { votedIds: string[] } }).turn.votedIds).toEqual(["u2"]);
  });

  it("отклонённый ход (422) не меняет состояние и версию", async () => {
    const { s, roomId } = await askingRoom();
    const base = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    const bad = await http(s, "u2", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "ask", text: "Не мой ход?" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatch(/[а-я]/i);
    expect((await http(s, "u2", "GET", `/rooms/${roomId}/view`)).body.version).toBe(base.body.version);
  });

  it("отказ транзакции не оставляет частичной записи", async () => {
    const { s, roomId } = await askingRoom();
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    const commands = count(s, "rr_whoami_commands");
    const original = s.db.prepare.bind(s.db);
    s.db.prepare = (sql: string) => {
      if (sql.startsWith("INSERT INTO rr_whoami_commands")) throw new Error("диск переполнен");
      return original(sql);
    };
    const failed = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "ask", text: "Сломается?" } });
    s.db.prepare = original;
    expect(failed.status).toBe(500);
    expect(failed.raw).not.toContain("диск");
    const after = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(after.body.version).toBe(base.body.version);
    expect((after.body.view as { turn: { question: string | null } }).turn.question).toBeNull();
    expect(count(s, "rr_whoami_commands")).toBe(commands);
  });

  it("граница nowMs === deadline: вопрос на дедлайне не принимается", async () => {
    const { s, roomId } = await askingRoom();
    const base = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    s.clock.now = (base.body.view as { deadline: number }).deadline;
    const late = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.body.version, action: { type: "ask", text: "Поздно?" } });
    expect(late.status).not.toBe(200);
    const after = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect((after.body.view as { history: { timedOut: string }[] }).history[0]?.timedOut).toBe("ask");
  });

  it("частота: больше 10 команд в секунду — 429", async () => {
    const { s, roomId } = await askingRoom();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await http(s, "u3", "POST", `/rooms/${roomId}/ready`, { commandId: uuid(), expectedVersion: 0, ready: true })).status);
    expect(statuses).toContain(429);
  });

  it("maxPlayers: 12 входят через API, 13-й получает 422", async () => {
    const s = await startServer();
    server = s;
    await seedTerms(s);
    const roomId = await lobbyWith(s, 12);
    const extra = await command(s, "u13", roomId, "join");
    expect(extra.status).toBe(422);
    expect(extra.body.error).toContain("12");
    expect((await command(s, "u1", roomId, "start")).status).toBe(200);
  });

  it("недостаточно терминов: старт отклоняется с понятным сообщением", async () => {
    const s = await startServer();
    server = s;
    await seedTerms(s, TERMS.slice(0, 2));
    const roomId = await lobbyWith(s, 3);
    const started = await command(s, "u1", roomId, "start");
    expect(started.status).toBe(422);
    expect(started.body.error).toContain("Недостаточно");
  });
});

describe("хранение", () => {
  it("результат сохраняется ровно один раз, повторная финализация ничего не начисляет", async () => {
    const { s, roomId } = await askingRoom();
    await playOut(s, roomId);
    s.registration.tick();
    s.registration.tick();
    await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(count(s, "rr_whoami_results")).toBe(1);
    expect(count(s, "rr_whoami_scores")).toBe(3);
    const view = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ phase: "finished", outcome: { draw: true, winnerIds: [] } });
  });

  it("все отсутствуют 10 минут — отмена без победителя", async () => {
    const { s, roomId } = await askingRoom();
    s.clock.now += 3_600_000;
    s.registration.tick();
    const view = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ phase: "cancelled" });
    const row = s.db.prepare("SELECT outcome FROM rr_whoami_results").get() as { outcome: string };
    expect(row.outcome).toBe("cancelled");
  });

  it("реванш создаёт новую сессию и сохраняет историю", async () => {
    const { s, roomId } = await askingRoom();
    await playOut(s, roomId);
    const finished = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect((await command(s, "u2", roomId, "rematch")).status).toBe(403);
    const rematch = await command(s, "u1", roomId, "rematch");
    expect(rematch.status).toBe(200);
    expect((rematch.body.view as { sessionId: string; phase: string }).phase).toBe("lobby");
    expect((rematch.body.view as { sessionId: string }).sessionId).not.toBe((finished.body.view as { sessionId: string }).sessionId);
    expect(count(s, "rr_whoami_sessions")).toBe(2);
  });

  it("миграция идемпотентна и не удаляет данные", async () => {
    const { s } = await askingRoom();
    const rooms = count(s, "rr_whoami_rooms");
    migrate(s.db);
    migrate(s.db);
    expect(count(s, "rr_whoami_rooms")).toBe(rooms);
    const meta = s.db.prepare("SELECT value FROM rr_whoami_meta WHERE key = 'schemaVersion'").get() as { value: string };
    expect(meta.value).toBe("1");
  });

  it("правка и удаление контента после старта не ломают текущую партию", async () => {
    const { s, roomId } = await askingRoom();
    const list = await http(s, "editor", "GET", "/admin/content");
    const row = (list.body.items as { id: string; revision: number }[]).find((r) => r.id === "t02");
    if (!row) throw new Error("нет t02");
    expect((await http(s, "editor", "PUT", `/admin/content/t02`, { item: term("t02", { term: "Изменённый" }), expectedRevision: row.revision })).status).toBe(200);
    const fresh = ((await http(s, "editor", "GET", "/admin/content")).body.items as { id: string; revision: number }[]).find((r) => r.id === "t02");
    expect((await http(s, "editor", "DELETE", `/admin/content/t02?expectedRevision=${fresh?.revision}`)).status).toBe(200);
    await playOut(s, roomId);
    const final = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(final.body.view?.phase).toBe("finished");
    expect(final.raw).toContain("Термин t02");
    expect(final.raw).not.toContain("Изменённый");
  });

  it("дедлайн восстанавливается из БД после рестарта", async () => {
    const db = openDb();
    const first = await startServer({ db });
    server = first;
    await seedTerms(first);
    const roomId = await lobbyWith(first, 3);
    await command(first, "u1", roomId, "start");
    const deadline = first.registration.nextWakeAt();
    await first.close();
    const second = await startServer({ db, now: first.clock.now });
    server = second;
    expect(second.registration.nextWakeAt()).toBe(deadline);
    second.clock.now += TIMINGS.assignMs;
    second.registration.tick();
    const view = await http(second, "u1", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view?.phase).toBe("asking");
    expect(second.broadcasts.count).toBeGreaterThan(0);
  });
});

describe("контент", () => {
  it("пустое определение — только черновик; 409 по ревизии; экспорт; каталог без контента", async () => {
    const s = await startServer();
    server = s;
    const empty = term("e01", { definition: "" });
    const report = await http(s, "editor", "POST", "/admin/content/import", { items: [{ status: "published", item: empty }, { status: "published", item: term("ok01") }] });
    expect(report.body).toMatchObject({ created: 2, published: 1 });
    expect((report.body.drafts as { title: string }[])[0]?.title).toBe("Термин e01");
    expect((await http(s, "editor", "POST", "/admin/content/e01/status", { status: "published", expectedRevision: 1 })).status).toBe(422);
    expect((await http(s, "editor", "PUT", "/admin/content/e01", { item: term("e01"), expectedRevision: 7 })).status).toBe(409);
    const duplicate = await http(s, "editor", "POST", "/admin/content/check", { item: term("zz", { term: "Термин ok01" }) });
    expect((duplicate.body.review as { warnings: string[] }).warnings.join(" ")).toContain("Совпадает");
    expect(((await http(s, "editor", "GET", "/admin/content/export")).body.items as unknown[]).length).toBe(2);
    const catalog = await http(s, "u1", "GET", "/catalog");
    expect(catalog.body).toMatchObject({ publishedCount: 1, enoughContent: false });
    expect(catalog.raw).not.toContain("Термин");
  });

  it("авторский набор: не меньше 40 терминов без ошибок и замечаний", async () => {
    const s = await startServer();
    server = s;
    const seed = JSON.parse(fs.readFileSync(path.join(here, "../../../server/games/whoami/content/terms.seed.json"), "utf8")) as { items: unknown[] };
    expect(seed.items.length).toBeGreaterThanOrEqual(40);
    const report = await http(s, "editor", "POST", "/admin/content/import", { items: seed.items.map((item) => ({ status: "published", item })) });
    expect(report.body).toMatchObject({ published: seed.items.length, rejected: [], drafts: [] });
    const list = await http(s, "editor", "GET", "/admin/content");
    const warnings = (list.body.items as { review: { warnings: string[] } }[]).flatMap((row) => row.review.warnings);
    expect(warnings).toEqual([]);
  });

  it("адаптер учебных заданий собирает черновики только из опубликованных заданий", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(here, "base-tasks.json"), "utf8")) as { tasks: unknown[]; categoryByRule: Record<string, string> };
    const drafts = fixture.tasks.map((raw) => {
      const parsed = parseBaseTask(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      return draftFromBaseTask(parsed.value, fixture.categoryByRule[parsed.value.ruleId] ?? "Без категории");
    });
    expect(drafts[0]).toMatchObject({ ok: true, value: { term: "Наречие", difficulty: 2, category: "Части речи" } });
    expect(drafts[1]).toMatchObject({ ok: true, value: { term: "Антоним", acceptedAnswers: ["антонимы"] } });
    expect(drafts[2]).toBeNull();
  });
});
