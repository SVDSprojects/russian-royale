import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "../../../server/games/alias/index";
import { draftFromBaseTask, reviewItem } from "../../../server/games/alias/content";
import { parseBaseTask, TIMINGS } from "../../../shared/games/alias/types";
import { card, CARDS, command, http, lobbyWith, openDb, PLAYERS, seedCards, startServer, uuid, viewOf, type TestServer } from "./helpers";

const here = path.dirname(fileURLToPath(import.meta.url));
let server: TestServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

/** Комната 4 игроков: команды [u1,u3] и [u2,u4]; объясняет u1, колода c1…c40 по порядку. */
async function startedRoom(n = 4): Promise<{ s: TestServer; roomId: string }> {
  const s = await startServer();
  server = s;
  await seedCards(s);
  const roomId = await lobbyWith(s, n);
  const started = await command(s, "u1", roomId, "start");
  expect(started.status).toBe(200);
  return { s, roomId };
}

async function explainingRoom(n = 4): Promise<{ s: TestServer; roomId: string }> {
  const room = await startedRoom(n);
  room.s.clock.now += TIMINGS.prepareMs;
  return room;
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
    const { s, roomId } = await explainingRoom();
    const view = await http(s, "stranger", "GET", `/rooms/${roomId}/view`);
    expect(view.status).toBe(404);
    expect(view.raw).not.toContain("Термин");
    expect((await http(s, "stranger", "GET", "/rooms?serverId=srv")).status).toBe(403);
    expect((await http(s, "stranger", "POST", "/rooms", { serverId: "srv", name: "x", commandId: uuid(), expectedVersion: 0 })).status).toBe(403);
  });

  it("зритель и участник другой комнаты не ходят и не видят термин и ответы", async () => {
    const { s, roomId } = await explainingRoom();
    await command(s, "u3", roomId, "actions", { action: { type: "guess", text: "секретная догадка", cardSeq: 1 } });
    const spectator = await http(s, "u9", "GET", `/rooms/${roomId}/view`);
    expect(spectator.status).toBe(200);
    expect(spectator.body.view).toMatchObject({ isParticipant: false, card: null, guesses: [], myRole: "spectator" });
    expect(spectator.raw).not.toMatch(/Термин1|термин1|запрет1|секретная догадка|state_json|forbiddenPhrases|acceptedAnswers/);
    const act = await http(s, "u9", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: spectator.body.version, action: { type: "guess", text: "x", cardSeq: 1 } });
    expect(act.status).toBe(403);
    expect((await http(s, "u9", "POST", `/rooms/${roomId}/join`, { commandId: uuid(), expectedVersion: spectator.body.version })).status).toBe(422);
  });

  it("другая команда не видит термин и догадки, объясняющий видит, своя команда видит догадки", async () => {
    const { s, roomId } = await explainingRoom();
    await command(s, "u3", roomId, "actions", { action: { type: "guess", text: "секретная догадка", cardSeq: 1 } });
    const explainer = await viewOf(s, "u1", roomId);
    expect(explainer.view.card?.term).toBe("Термин1");
    expect(explainer.raw).toContain("секретная догадка");
    const teammate = await viewOf(s, "u3", roomId);
    expect(teammate.raw).toContain("секретная догадка");
    expect(teammate.raw).not.toMatch(/Термин1|запрет1/);
    for (const other of ["u2", "u4"]) {
      const view = await viewOf(s, other, roomId);
      expect(view.raw).not.toMatch(/Термин1|термин1|запрет1|секретная догадка|acceptedAnswers|forbidden|"deck"/);
    }
    const list = await http(s, "u2", "GET", "/rooms?serverId=srv");
    expect(list.raw).not.toMatch(/Термин|sessionId|state/);
  });

  it("выбывший видит только свою проекцию и не действует", async () => {
    const { s, roomId } = await explainingRoom(5);
    expect((await command(s, "u5", roomId, "leave")).status).toBe(200);
    const view = await http(s, "u5", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ isParticipant: false, myRole: "spectator", card: null });
    expect((await command(s, "u5", roomId, "actions", { action: { type: "guess", text: "я тут", cardSeq: 1 } })).status).toBe(403);
  });

  it("игрок не может редактировать контент, редактор может", async () => {
    const s = await startServer();
    server = s;
    expect((await http(s, "u1", "GET", "/admin/content")).status).toBe(403);
    expect((await http(s, "u1", "POST", "/admin/content", { item: card(1) })).status).toBe(403);
    expect((await http(s, "editor", "GET", "/admin/content")).status).toBe(200);
  });
});

describe("команды, версии и гонки", () => {
  it("формат, неизвестное действие и маршрутные команды через /actions — 400", async () => {
    const { s, roomId } = await startedRoom();
    const v = (await http(s, "u1", "GET", `/rooms/${roomId}/view`)).body.version;
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: "nope", expectedVersion: v, action: { type: "autoTeams" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "hack" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "start" } })).status).toBe(400);
    expect((await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: v, action: { type: "guess", text: "x", cardSeq: "1" } })).status).toBe(400);
    expect((await http(s, "u1", "GET", "/rooms/bad%20id/view")).status).toBe(404);
  });

  it("двойное верное угадывание на одной версии: одно очко, второй ответ — 409", async () => {
    const { s, roomId } = await explainingRoom(5);
    const base = await viewOf(s, "u3", roomId);
    const body = (text: string) => ({ commandId: uuid(), expectedVersion: base.version, action: { type: "guess", text, cardSeq: 1 } });
    const [a, b] = await Promise.all([
      http(s, "u3", "POST", `/rooms/${roomId}/actions`, body("термин1")),
      http(s, "u5", "POST", `/rooms/${roomId}/actions`, body("Термин1")),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const after = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    const teams = (after.body.view as { teams: { score: number }[] }).teams;
    expect(teams[0]?.score).toBe(1);
  });

  it("повтор commandId не повторяет действие", async () => {
    const { s, roomId } = await explainingRoom();
    const base = await viewOf(s, "u1", roomId);
    const body = { commandId: uuid(), expectedVersion: base.version, action: { type: "skip", cardSeq: 1 } };
    const first = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, body);
    const replay = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, body);
    expect(replay.status).toBe(200);
    expect(replay.body.version).toBe(first.body.version);
    expect((replay.body.view as { teams: { score: number }[] }).teams[0]?.score).toBe(-1);
  });

  it("запрещённое объяснение (422) не меняет состояние и версию, ответ не раскрывает слово", async () => {
    const { s, roomId } = await explainingRoom();
    const base = await viewOf(s, "u1", roomId);
    const bad = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.version, action: { type: "explain", text: "Кот, который…" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toContain("кот");
    expect((await viewOf(s, "u1", roomId)).version).toBe(base.version);
    const ok = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.version, action: { type: "explain", text: "который котёл" } });
    expect(ok.status).toBe(200);
  });

  it("отказ транзакции не оставляет частичной записи", async () => {
    const { s, roomId } = await explainingRoom();
    const base = await viewOf(s, "u1", roomId);
    const commands = count(s, "rr_alias_commands");
    const original = s.db.prepare.bind(s.db);
    s.db.prepare = (sql: string) => {
      if (sql.startsWith("INSERT INTO rr_alias_commands")) throw new Error("диск переполнен");
      return original(sql);
    };
    const failed = await http(s, "u1", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.version, action: { type: "skip", cardSeq: 1 } });
    s.db.prepare = original;
    expect(failed.status).toBe(500);
    expect(failed.raw).not.toContain("диск");
    const after = await viewOf(s, "u1", roomId);
    expect(after.version).toBe(base.version);
    expect(after.view.cardSeq).toBe(1);
    expect(count(s, "rr_alias_commands")).toBe(commands);
  });

  it("граница nowMs === deadline: ответ на дедлайне не принимается, карточка без штрафа", async () => {
    const { s, roomId } = await explainingRoom();
    const base = await viewOf(s, "u3", roomId);
    s.clock.now = (base.view as unknown as { deadline: number }).deadline;
    const late = await http(s, "u3", "POST", `/rooms/${roomId}/actions`, { commandId: uuid(), expectedVersion: base.version, action: { type: "guess", text: "термин1", cardSeq: 1 } });
    expect(late.status).not.toBe(200);
    const after = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect(after.body.view).toMatchObject({ phase: "turnResult" });
    expect((after.body.view as { teams: { score: number }[] }).teams[0]?.score).toBe(0);
  });

  it("частота ответов 800 мс — 429; больше 10 команд в секунду — 429", async () => {
    const { s, roomId } = await explainingRoom();
    const first = await command(s, "u3", roomId, "actions", { action: { type: "guess", text: "раз", cardSeq: 1 } });
    expect(first.status).toBe(200);
    s.clock.now += 100;
    const fast = await command(s, "u3", roomId, "actions", { action: { type: "guess", text: "два", cardSeq: 1 } });
    expect(fast.status).toBe(429);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await http(s, "u4", "POST", `/rooms/${roomId}/ready`, { commandId: uuid(), expectedVersion: 0, ready: true })).status);
    expect(statuses).toContain(429);
  });

  it("maxPlayers: 16 входят через API, 17-й получает 422", async () => {
    const s = await startServer();
    server = s;
    await seedCards(s);
    const roomId = await lobbyWith(s, 16, { teamCount: 4, rounds: 3 });
    const extra = await command(s, "u17", roomId, "join");
    expect(extra.status).toBe(422);
    expect(extra.body.error).toContain("16");
    expect((await command(s, "u1", roomId, "start")).status).toBe(200);
  });

  it("ручное назначение команд через API и запрет для не-ведущего", async () => {
    const s = await startServer();
    server = s;
    await seedCards(s);
    const roomId = await lobbyWith(s, 4);
    expect((await command(s, "u2", roomId, "actions", { action: { type: "assignTeam", userId: "u3", team: 1 } })).status).toBe(403);
    const moved = await command(s, "u1", roomId, "actions", { action: { type: "assignTeam", userId: "u3", team: 1 } });
    expect(moved.status).toBe(200);
    expect((moved.body.view as { startBlockers: string[] }).startBlockers.join(" ")).toContain("Шестерёнки");
    expect((await command(s, "u1", roomId, "start")).status).toBe(422);
    expect((await command(s, "u1", roomId, "actions", { action: { type: "autoTeams" } })).status).toBe(200);
  });
});

describe("хранение", () => {
  it("результат сохраняется ровно один раз, повторная финализация ничего не начисляет", async () => {
    const { s, roomId } = await startedRoom();
    for (let i = 0; i < 20; i += 1) {
      s.clock.now += 40_000;
      s.registration.tick();
    }
    s.registration.tick();
    await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(count(s, "rr_alias_results")).toBe(1);
    expect(count(s, "rr_alias_scores")).toBe(4);
    expect((await http(s, "u2", "GET", `/rooms/${roomId}/view`)).body.view?.phase).toBe("finished");
  });

  it("реванш создаёт новую сессию и сохраняет историю", async () => {
    const { s, roomId } = await startedRoom();
    s.clock.now += 3_600_000;
    const finished = await http(s, "u1", "GET", `/rooms/${roomId}/view`);
    expect(finished.body.view?.phase).toBe("finished");
    const host = String((finished.body.view as { hostId: string }).hostId);
    const other = PLAYERS.slice(0, 4).find((p) => p.id !== host)?.id ?? "u2";
    expect((await command(s, other, roomId, "rematch")).status).toBe(403);
    const rematch = await command(s, host, roomId, "rematch");
    expect(rematch.status).toBe(200);
    expect(rematch.body.view).toMatchObject({ phase: "lobby" });
    expect(count(s, "rr_alias_sessions")).toBe(2);
  });

  it("все отсутствуют 10 минут: вернувшийся игрок не отменяет уже наступившую отмену", async () => {
    const s = await startServer();
    server = s;
    await seedCards(s);
    const roomId = await lobbyWith(s, 4);
    s.clock.now += 11 * 60_000;
    const view = await http(s, "u2", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view).toMatchObject({ phase: "cancelled" });
  });

  it("миграция идемпотентна и не удаляет данные", async () => {
    const { s } = await startedRoom();
    const rooms = count(s, "rr_alias_rooms");
    migrate(s.db);
    migrate(s.db);
    expect(count(s, "rr_alias_rooms")).toBe(rooms);
    const meta = s.db.prepare("SELECT value FROM rr_alias_meta WHERE key = 'schemaVersion'").get() as { value: string };
    expect(meta.value).toBe("1");
  });

  it("правка и удаление карточки после старта не ломают текущую партию", async () => {
    const { s, roomId } = await explainingRoom();
    const list = await http(s, "editor", "GET", "/admin/content");
    const row = (list.body.items as { id: string; revision: number; item: { id: string } }[]).find((r) => r.item.id === "c1");
    if (!row) throw new Error("нет c1");
    const changed = await http(s, "editor", "PUT", `/admin/content/${row.id}`, { item: { ...card(1), term: "Изменённый" }, expectedRevision: row.revision });
    expect(changed.status).toBe(200);
    const fresh = ((await http(s, "editor", "GET", "/admin/content")).body.items as { id: string; revision: number }[]).find((r) => r.id === row.id);
    expect((await http(s, "editor", "DELETE", `/admin/content/${row.id}?expectedRevision=${fresh?.revision}`)).status).toBe(200);
    const explainer = await viewOf(s, "u1", roomId);
    expect(explainer.view.card?.term).toBe("Термин1");
    const guess = await command(s, "u3", roomId, "actions", { action: { type: "guess", text: "термин1", cardSeq: 1 } });
    expect(guess.status).toBe(200);
    expect((guess.body.view as { teams: { score: number }[] }).teams[0]?.score).toBe(1);
  });

  it("дедлайн восстанавливается из БД после рестарта", async () => {
    const db = openDb();
    const first = await startServer({ db });
    server = first;
    await seedCards(first);
    const roomId = await lobbyWith(first, 4);
    await command(first, "u1", roomId, "start");
    const deadline = first.registration.nextWakeAt();
    await first.close();
    const second = await startServer({ db, now: first.clock.now });
    server = second;
    expect(second.registration.nextWakeAt()).toBe(deadline);
    second.clock.now += TIMINGS.prepareMs;
    second.registration.tick();
    const view = await http(second, "u1", "GET", `/rooms/${roomId}/view`);
    expect(view.body.view?.phase).toBe("explaining");
    expect(second.broadcasts.count).toBeGreaterThan(0);
  });
});

describe("контент", () => {
  it("публикация требует корректной карточки, импорт сохраняет ошибки черновиками", async () => {
    const s = await startServer();
    server = s;
    const blocked = { ...card(90), forbiddenPhrases: ["и", "кот", "пёс", "дом"] };
    const report = await http(s, "editor", "POST", "/admin/content/import", { items: [{ status: "published", item: blocked }, { status: "published", item: card(91) }] });
    expect(report.body).toMatchObject({ created: 2, published: 1 });
    const created = await http(s, "editor", "POST", "/admin/content", { item: blocked });
    const id = String(created.body.id);
    expect((await http(s, "editor", "POST", `/admin/content/${id}/status`, { status: "published", expectedRevision: 1 })).status).toBe(422);
    expect((await http(s, "editor", "PUT", `/admin/content/${id}`, { item: card(92), expectedRevision: 7 })).status).toBe(409);
    expect(((await http(s, "editor", "GET", "/admin/content/export")).body.items as unknown[]).length).toBe(3);
    const catalog = await http(s, "u1", "GET", "/catalog");
    expect(catalog.body).toMatchObject({ publishedCount: 1, enoughContent: false });
    expect(catalog.raw).not.toContain("Термин");
  });

  it("проверка «невозможно объяснить»: служебные слова, короткий корень, однобуквенный ответ", () => {
    expect(reviewItem({ ...card(1), forbiddenPhrases: ["и", "кот", "пёс"] }, []).errors.join(" ")).toContain("служебное");
    expect(reviewItem({ ...card(1), forbiddenForms: ["те*"] }, []).errors.join(" ")).toContain("короткий");
    expect(reviewItem({ ...card(1), acceptedAnswers: ["я"] }, []).errors.join(" ")).toContain("невозможно");
    expect(reviewItem({ ...card(1), forbiddenPhrases: ["термин1", "ответ1", "кот"] }, []).errors.join(" ")).toContain("минимум 3");
    expect(reviewItem(card(1), [card(1), { ...card(2), id: "dup", term: "Термин1" }]).warnings.join(" ")).toContain("уже есть");
    expect(reviewItem(card(1), [])).toEqual({ errors: [], warnings: [] });
  });

  it("авторский набор: не меньше 60 карточек без ошибок и замечаний, у каждой ≥ 3 запретов", async () => {
    const s = await startServer();
    server = s;
    const seed = JSON.parse(fs.readFileSync(path.join(here, "../../../server/games/alias/content/cards.seed.json"), "utf8")) as { items: { forbiddenPhrases: string[] }[] };
    expect(seed.items.length).toBeGreaterThanOrEqual(60);
    expect(seed.items.every((item) => item.forbiddenPhrases.length >= 3)).toBe(true);
    const report = await http(s, "editor", "POST", "/admin/content/import", { items: seed.items.map((item) => ({ status: "published", item })) });
    expect(report.body).toMatchObject({ published: seed.items.length, rejected: [], drafts: [] });
    const list = await http(s, "editor", "GET", "/admin/content");
    const warnings = (list.body.items as { review: { warnings: string[] } }[]).flatMap((row) => row.review.warnings);
    expect(warnings).toEqual([]);
  });

  it("адаптер учебного задания даёт черновик карточки только из опубликованного задания", () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(here, "base-tasks.json"), "utf8")) as { tasks: unknown[] };
    const tasks = fixture.tasks.map((raw) => {
      const parsed = parseBaseTask(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.value;
    });
    const published = tasks.find((t) => t.status === "published");
    const draft = tasks.find((t) => t.status === "draft");
    if (!published || !draft) throw new Error("фикстура неполная");
    const made = draftFromBaseTask(published, "Лексика", ["близкие по значению", "похожий смысл", "антоним"]);
    expect(made.ok).toBe(true);
    if (made.ok) expect(made.value.term).toBe(published.acceptedAnswers[0]);
    expect(draftFromBaseTask(draft, "Лексика", ["a", "b", "c"]).ok).toBe(false);
    expect(CARDS).toHaveLength(40);
  });
});
