import { describe, expect, it } from "vitest";
import * as engine from "../../../server/games/impostor/engine";
import { EngineError } from "../../../server/games/impostor/engine";
import { MAX_PLAYERS, SKIP_TEXT, TIMINGS, type State } from "../../../shared/games/impostor/types";
import { findForbidden } from "../../../shared/games/impostor/text";
import { CONTENT, ctxAt, deepFreeze, pair, PLAYERS, readyLobby, seeded, sequence, SETTINGS } from "./helpers";

const T0 = 1_000;

/** Старт: пара p1, самозванец — u2 (индекс 1), сторона самозванца "b", порядок сохраняется. */
function started(n = 4): State {
  const lobby = readyLobby(n);
  // randomInt: пара → 0, самозванец → 1, сторона → 1 (b), перемешивание → j = i (порядок не меняется)
  const shuffle = Array.from({ length: n - 1 }, (_, k) => n - 1 - k);
  return engine.start(lobby, "u1", ctxAt(T0, sequence([0, 1, 1, ...shuffle])));
}

function toExamples(state: State): State {
  return engine.advance(state, ctxAt(T0 + TIMINGS.dealMs));
}

function playRound(state: State, at: number): { state: State; at: number } {
  let current = state;
  let now = at;
  for (let i = 0; i < current.participants.length; i += 1) {
    const view = engine.project(current, "u1");
    if (!view.currentTurnId) break;
    now += 1_000;
    current = engine.apply(current, { type: "example", text: `пример ${i}` }, view.currentTurnId, ctxAt(now));
  }
  return { state: current, at: now };
}

function toVoting(n = 4): { state: State; at: number } {
  let { state, at } = playRound(toExamples(started(n)), T0 + TIMINGS.dealMs);
  expect(state.phase).toBe("discussion");
  at = state.deadline ?? at;
  state = engine.advance(state, ctxAt(at));
  ({ state, at } = playRound(state, at));
  expect(state.phase).toBe("voting");
  return { state, at };
}

function voteAll(state: State, at: number, choose: (voter: string) => string): State {
  let current = state;
  for (const p of state.participants) current = engine.apply(current, { type: "vote", targetId: choose(p.id) }, p.id, ctxAt(at + 100));
  return current;
}

describe("создание и лобби", () => {
  it("пустой состав — отдельное исключение", () => {
    expect(() => engine.create({ sessionId: "s", hostId: "u1", participants: [], settings: SETTINGS, contentSnapshot: CONTENT, ctx: ctxAt(0) })).toThrowError(
      expect.objectContaining({ code: "empty" }),
    );
  });

  it("минимум игроков: трёх недостаточно", () => {
    const lobby = readyLobby(3);
    expect(engine.startBlockers(lobby)[0]).toContain("минимум 4");
    expect(() => engine.start(lobby, "u1", ctxAt(T0))).toThrow(EngineError);
  });

  it("максимум 16: семнадцатый не входит", () => {
    let state = readyLobby(MAX_PLAYERS);
    expect(state.participants).toHaveLength(16);
    expect(() => engine.join(state, PLAYERS[16] as { id: string; username: string }, ctxAt(T0))).toThrow("16");
    state = engine.start(state, "u1", ctxAt(T0, seeded(1)));
    expect(state.phase).toBe("deal");
  });

  it("старт только ведущим и только при готовности всех", () => {
    const lobby = readyLobby(4);
    expect(() => engine.start(lobby, "u2", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "forbidden" }));
    const notReady = engine.setReady(lobby, "u3", false);
    expect(() => engine.start(notReady, "u1", ctxAt(T0))).toThrow("Не готовы");
  });

  it("пустой пул контента: старт запрещён с понятной ошибкой", () => {
    const lobby = readyLobby(4, { takenAt: 0, pairs: [] });
    expect(() => engine.start(lobby, "u1", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "content" }));
    expect(engine.project(lobby, "u1").startBlockers.join(" ")).toContain("контент");
  });

  it("после старта новые игроки не входят", () => {
    expect(() => engine.join(started(), { id: "u9", username: "Новый" }, ctxAt(T0))).toThrow("началась");
  });
});

describe("полный путь партии", () => {
  it("лобби → раздача → два круга → голосование → раскрытие → итоги; большинство ловит самозванца", () => {
    const { state, at } = toVoting(5);
    const voted = voteAll(state, at, (voter) => (voter === "u2" ? "u1" : "u2"));
    expect(voted.phase).toBe("reveal");
    const finished = engine.advance(voted, ctxAt(at + 100 + TIMINGS.revealMs));
    expect(finished.phase).toBe("finished");
    const result = engine.result(finished);
    expect(result).toMatchObject({ sessionId: "s1", outcome: "win" });
    expect(result?.winnerUserIds.sort()).toEqual(["u1", "u3", "u4", "u5"]);
    expect(result?.scores).toContainEqual({ userId: "u2", score: 30 });
    expect(result?.scores).toContainEqual({ userId: "u1", score: 100 });
    expect(engine.nextDeadline(finished)).toBeNull();
  });

  it("большинство указало на мирного — побеждает самозванец", () => {
    const { state, at } = toVoting(4);
    const voted = voteAll(state, at, (voter) => (voter === "u3" ? "u4" : "u3"));
    expect(voted.outcome).toMatchObject({ winner: "impostor", accusedId: "u3", winnerIds: ["u2"] });
  });

  it("без строгого большинства побеждает самозванец (ничья голосов)", () => {
    const { state, at } = toVoting(4);
    const votes: Record<string, string> = { u1: "u2", u2: "u3", u3: "u2", u4: "u3" };
    const voted = voteAll(state, at, (voter) => votes[voter] ?? "u1");
    expect(voted.outcome).toMatchObject({ winner: "impostor", accusedId: null });
  });

  it("большинство при чётном и нечётном N", () => {
    expect(engine.majorityNeeded(4)).toBe(3);
    expect(engine.majorityNeeded(5)).toBe(3);
    expect(engine.majorityNeeded(6)).toBe(4);
    expect(engine.majorityNeeded(16)).toBe(9);
    const { state, at } = toVoting(6);
    const votes: Record<string, string> = { u1: "u2", u3: "u2", u4: "u2", u2: "u1", u5: "u1", u6: "u1" };
    const voted = voteAll(state, at, (voter) => votes[voter] ?? "u1");
    expect(voted.outcome?.accusedId).toBeNull();
  });

  it("неголосовавшие и вышедшие остаются в знаменателе", () => {
    const { state, at } = toVoting(5);
    let current = engine.leave(state, "u5", ctxAt(at));
    current = engine.apply(current, { type: "vote", targetId: "u2" }, "u1", ctxAt(at + 1));
    current = engine.apply(current, { type: "vote", targetId: "u2" }, "u3", ctxAt(at + 2));
    current = engine.advance(current, ctxAt(at + TIMINGS.votingMs + 10));
    expect(current.outcome).toMatchObject({ accusedId: null, winner: "impostor" });
  });
});

describe("ходы и таймеры", () => {
  it("таймаут примера записывает «Пропуск» и передаёт ход", () => {
    const state = toExamples(started());
    const after = engine.advance(state, ctxAt(T0 + TIMINGS.dealMs + TIMINGS.exampleMs));
    expect(after.match?.examples[0]).toMatchObject({ authorId: "u1", text: SKIP_TEXT, skipped: true });
    expect(engine.project(after, "u1").currentTurnId).toBe("u2");
  });

  it("граница nowMs === deadline: ход уже просрочен", () => {
    const state = toExamples(started());
    const deadline = state.deadline ?? 0;
    expect(() => engine.apply(state, { type: "example", text: "поздно" }, "u1", ctxAt(deadline))).toThrow("истекло");
    expect(engine.advance(state, ctxAt(deadline - 1))).toBe(state);
    expect(engine.advance(state, ctxAt(deadline)).match?.turn).toBe(1);
  });

  it("каждая фаза завершается по таймеру, дедлайн считается от предыдущего", () => {
    const state = started();
    const all = engine.advance(state, ctxAt(T0 + 3_600_000));
    expect(all.phase).toBe("finished");
    expect(all.match?.examples.filter((e) => e.skipped)).toHaveLength(8);
    const firstSkip = all.match?.examples[0]?.at;
    expect(firstSkip).toBe(T0 + TIMINGS.dealMs + TIMINGS.exampleMs);
    const total = TIMINGS.dealMs + 8 * TIMINGS.exampleMs + TIMINGS.discussionMs + TIMINGS.votingMs + TIMINGS.revealMs;
    expect(all.phaseStartedAt).toBe(T0 + total);
    expect(engine.result(all)?.winnerUserIds).toEqual(["u2"]);
  });

  it("запретное слово отклоняется без расхода хода, таймер продолжается", () => {
    const state = deepFreeze(toExamples(started()));
    expect(() => engine.apply(state, { type: "example", text: "Это АЛЬФА-версия" }, "u1", ctxAt(T0 + TIMINGS.dealMs + 5))).toThrow("запретное");
    expect(state.match?.turn).toBe(0);
    expect(state.deadline).toBe(T0 + TIMINGS.dealMs + TIMINGS.exampleMs);
  });

  it("чужой ход, пустой и длинный текст отклоняются", () => {
    const state = toExamples(started());
    const at = ctxAt(T0 + TIMINGS.dealMs + 1);
    expect(() => engine.apply(state, { type: "example", text: "мой" }, "u2", at)).toThrow("другого игрока");
    expect(() => engine.apply(state, { type: "example", text: "   " }, "u1", at)).toThrow("пустой");
    expect(() => engine.apply(state, { type: "example", text: "я".repeat(101) }, "u1", at)).toThrow("100");
  });

  it("вышедший игрок пропускает ход сразу", () => {
    let state = toExamples(started());
    state = engine.leave(state, "u2", ctxAt(T0 + TIMINGS.dealMs + 1));
    state = engine.apply(state, { type: "example", text: "первый" }, "u1", ctxAt(T0 + TIMINGS.dealMs + 2));
    expect(state.match?.examples.map((e) => e.text)).toEqual(["первый", SKIP_TEXT]);
    expect(engine.project(state, "u1").currentTurnId).toBe("u3");
  });

  it("голос: один, неизменяемый, не за себя, только в фазе голосования", () => {
    const { state, at } = toVoting(4);
    expect(() => engine.apply(state, { type: "vote", targetId: "u1" }, "u1", ctxAt(at + 1))).toThrow("себя");
    const once = engine.apply(state, { type: "vote", targetId: "u2" }, "u1", ctxAt(at + 1));
    expect(() => engine.apply(once, { type: "vote", targetId: "u3" }, "u1", ctxAt(at + 2))).toThrow("не меняется");
    expect(() => engine.apply(toExamples(started()), { type: "vote", targetId: "u2" }, "u1", ctxAt(T0 + 9_000))).toThrow("не началось");
    expect(() => engine.apply(once, { type: "vote", targetId: "u2" }, "u9", ctxAt(at + 2))).toThrowError(expect.objectContaining({ code: "forbidden" }));
  });

  it("чат: только в обсуждении и не чаще раза в секунду", () => {
    const { state } = playRound(toExamples(started()), T0 + TIMINGS.dealMs);
    const at = state.phaseStartedAt;
    const one = engine.apply(state, { type: "chat", text: "Привет" }, "u1", ctxAt(at + 10));
    expect(() => engine.apply(one, { type: "chat", text: "Ещё" }, "u1", ctxAt(at + 500))).toThrowError(expect.objectContaining({ code: "rate" }));
    expect(engine.apply(one, { type: "chat", text: "Ещё" }, "u1", ctxAt(at + 1_100)).match?.chat).toHaveLength(2);
    const noChat = { ...state, settings: { chat: false } };
    expect(() => engine.apply(noChat, { type: "chat", text: "x" }, "u1", ctxAt(at + 10))).toThrow("отключён");
  });

  it("реванш через apply запрещён: нужен новый sessionId", () => {
    expect(() => engine.apply(started(), { type: "rematch" }, "u1", ctxAt(T0))).toThrow("новую сессию");
  });
});

describe("секретность проекции", () => {
  it("до финала view не содержит роли и чужой темы", () => {
    const states = [started(), toExamples(started()), toVoting(4).state];
    for (const state of states) {
      for (const p of state.participants) {
        const view = engine.project(state, p.id);
        const json = JSON.stringify(view);
        const own = view.myTopic?.title;
        const other = own === "Альфа p1" ? "Бета p1" : "Альфа p1";
        expect(json).not.toContain(other);
        expect(json).not.toMatch(/role|impostor(Id|Side)|forbidden|альф\*|бет\*/i);
        expect(view.reveal).toBeNull();
      }
    }
  });

  it("зритель не видит ни одной темы", () => {
    const view = engine.project(toExamples(started()), "spectator");
    expect(view.myTopic).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/Альфа p1|Бета p1/);
  });

  it("в финале видны обе темы, различие, примеры каталога и голоса", () => {
    const { state, at } = toVoting(4);
    const view = engine.project(voteAll(state, at, (v) => (v === "u2" ? "u1" : "u2")), "u3");
    expect(view.reveal).toMatchObject({ impostorId: "u2", pairTitle: "Пара p1", majorityTopic: { title: "Альфа p1" }, impostorTopic: { title: "Бета p1" } });
    expect(view.reveal?.majorityTopic.examples).toEqual(["один", "два", "три"]);
  });

  it("ровно один участник получает отличающуюся тему; выбор случайный и покрывает всех", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = engine.start(readyLobby(6), "u1", ctxAt(T0, seeded(seed)));
      const titles = state.participants.map((p) => engine.project(state, p.id).myTopic?.title);
      const counts = new Map<string, number>();
      for (const title of titles) counts.set(String(title), (counts.get(String(title)) ?? 0) + 1);
      expect([...counts.values()].sort()).toEqual([1, 5]);
      seen.add(state.match?.impostorId ?? "");
    }
    expect(seen.size).toBe(6);
  });
});

describe("неизменность, сериализация, восстановление", () => {
  it("функции не мутируют вход", () => {
    const lobby = deepFreeze(readyLobby(4));
    const s = deepFreeze(engine.start(lobby, "u1", ctxAt(T0)));
    const ex = deepFreeze(engine.advance(s, ctxAt(T0 + TIMINGS.dealMs)));
    const turn = engine.project(ex, "u1").currentTurnId ?? "";
    deepFreeze(engine.apply(ex, { type: "example", text: "ок" }, turn, ctxAt(T0 + TIMINGS.dealMs + 1)));
    deepFreeze(engine.leave(ex, "u3", ctxAt(T0 + TIMINGS.dealMs + 1)));
    deepFreeze(engine.syncPresence(ex, {}, T0 + 100_000));
    deepFreeze(engine.project(ex, "u1"));
    expect(lobby.phase).toBe("lobby");
  });

  it("JSON round-trip и восстановление после рестарта дают то же продолжение", () => {
    const state = toExamples(started());
    const restored = JSON.parse(JSON.stringify(state)) as State;
    expect(restored).toEqual(state);
    const later = ctxAt(T0 + 200_000);
    expect(engine.advance(restored, later)).toEqual(engine.advance(state, later));
  });

  it("присутствие: передача ведущего через 45 с и отмена через 10 минут", () => {
    const state = toExamples(started());
    const now = T0 + TIMINGS.dealMs + 50_000;
    const seen = { u1: now - 46_000, u2: now - 1_000, u3: now, u4: now };
    const moved = engine.syncPresence(state, seen, now);
    expect(moved.hostId).toBe("u2");
    expect(engine.syncPresence(state, { ...seen, u1: now - 10_000 }, now).hostId).toBe("u1");
    const gone = engine.syncPresence(state, { u1: 0, u2: 0, u3: 0, u4: 0 }, 700_000);
    expect(gone.phase).toBe("cancelled");
    expect(engine.result(gone)).toMatchObject({ outcome: "cancelled", winnerUserIds: [] });
    expect(engine.absenceCutoff(state, { u1: 5, u2: 9, u3: 1, u4: 2 })).toBe(9 + 600_000);
  });

  it("реванш: новая сессия, сброс готовности, другая пара при наличии альтернатив", () => {
    const finished = engine.advance(started(), ctxAt(T0 + 3_600_000));
    const next = engine.rematch(finished, "s2", "u1", ctxAt(T0 + 3_600_001));
    expect(next).toMatchObject({ sessionId: "s2", phase: "lobby", previousPairId: "p1" });
    expect(next.participants.every((p) => !p.ready)).toBe(true);
    for (const p of next.participants) Object.assign(p, { ready: true });
    for (let seed = 0; seed < 30; seed += 1) {
      expect(engine.start(next, "u1", ctxAt(T0, seeded(seed))).match?.pairId).not.toBe("p1");
    }
    const single = { ...next, content: { takenAt: 0, pairs: [pair("p1")] } };
    expect(engine.start(single, "u1", ctxAt(T0)).match?.pairId).toBe("p1");
  });
});

describe("словарь запретных слов", () => {
  it("целые слова, корни через «*», ё/е и пунктуация", () => {
    expect(findForbidden("Твёрдый знак!", ["тверд*"])).toBe("тверд*");
    expect(findForbidden("приставка, да", ["при"])).toBeNull();
    expect(findForbidden("при-ставка", ["при"])).toBe("при");
    expect(findForbidden("однородные члены", ["однородные члены"])).toBe("однородные члены");
    expect(findForbidden("мягкость", ["мягкий"])).toBeNull();
  });
});
