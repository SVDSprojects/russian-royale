import { describe, expect, it } from "vitest";
import * as engine from "../../../server/games/whoami/engine";
import { EngineError } from "../../../server/games/whoami/engine";
import { LIMITS, MAX_PLAYERS, TIMINGS, type Answer, type State } from "../../../shared/games/whoami/types";
import { matchesAnswer, normalizeAnswer } from "../../../shared/games/whoami/text";
import { CONTENT, ctxAt, deepFreeze, PLAYERS, readyLobby, seeded, term, TERMS } from "./helpers";

const T0 = 1_000;

/** Партия после раздачи: u1 → «Термин t01», u2 → t02 …; ходит u1. */
function started(n = 3, content = CONTENT): { state: State; at: number } {
  const state = engine.start(readyLobby(n, content), "u1", ctxAt(T0));
  const at = T0 + TIMINGS.assignMs;
  return { state: engine.advance(state, ctxAt(at)), at };
}

const askerOf = (state: State) => state.match?.turn?.askerId ?? null;

interface TurnPlan {
  question?: string;
  votes?: Record<string, Answer>;
  guess?: string | "skip";
}

/** Один личный ход текущего игрока, затем пауза nextTurn. Возвращает состояние на начало следующего хода. */
function playTurn(state: State, at: number, plan: TurnPlan): { state: State; at: number } {
  const asker = askerOf(state);
  if (!asker) throw new Error("никто не ходит");
  let now = at + 100;
  let next = engine.apply(state, { type: "ask", text: plan.question ?? "Я часть речи?" }, asker, ctxAt(now));
  for (const [voter, answer] of Object.entries(plan.votes ?? {})) {
    if (next.phase !== "peerVote") break;
    now += 10;
    next = engine.apply(next, { type: "answer", answer }, voter, ctxAt(now));
  }
  if (next.phase === "peerVote") next = engine.advance(next, ctxAt(next.deadline ?? now));
  now = Math.max(now, next.phaseStartedAt) + 100;
  next = plan.guess === "skip" || plan.guess === undefined ? engine.apply(next, { type: "skipGuess" }, asker, ctxAt(now)) : engine.apply(next, { type: "guess", text: plan.guess }, asker, ctxAt(now));
  if (next.phase === "finished") return { state: next, at: now };
  const resume = next.deadline ?? now;
  return { state: engine.advance(next, ctxAt(resume)), at: resume };
}

describe("создание и лобби", () => {
  it("пустой состав — отдельное исключение", () => {
    expect(() => engine.create({ sessionId: "s", hostId: "u1", participants: [], settings: { difficulty: "any" }, contentSnapshot: CONTENT, ctx: ctxAt(0) })).toThrowError(
      expect.objectContaining({ code: "empty" }),
    );
  });

  it("минимум 3 игрока и максимум 12", () => {
    expect(engine.startBlockers(readyLobby(2))[0]).toContain("минимум 3");
    const full = readyLobby(MAX_PLAYERS);
    expect(() => engine.join(full, PLAYERS[12] as { id: string; username: string }, ctxAt(T0))).toThrow("12");
    expect(engine.start(full, "u1", ctxAt(T0, seeded(3))).phase).toBe("assign");
  });

  it("старт только ведущим и при готовности всех; после старта вход закрыт", () => {
    const lobby = readyLobby(3);
    expect(() => engine.start(lobby, "u2", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "forbidden" }));
    expect(() => engine.start(engine.setReady(lobby, "u3", false), "u1", ctxAt(T0))).toThrow("Не готовы");
    expect(() => engine.join(started().state, { id: "u9", username: "Новый" }, ctxAt(T0))).toThrow("началась");
  });

  it("пустой и недостаточный пул: старт запрещён с понятным сообщением", () => {
    expect(() => engine.start(readyLobby(3, { takenAt: 0, terms: [] }), "u1", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "content" }));
    const two = readyLobby(3, { takenAt: 0, terms: TERMS.slice(0, 2) });
    expect(() => engine.start(two, "u1", ctxAt(T0))).toThrow("Недостаточно опубликованных терминов: 2 из 3");
    expect(engine.project(two, "u1").startBlockers.join(" ")).toContain("Недостаточно терминов");
    const hard = { ...readyLobby(3), settings: { difficulty: "hard" as const } };
    expect(engine.project(hard, "u1").contentCount).toBe(0);
  });

  it("термины в партии не повторяются", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = engine.start(readyLobby(MAX_PLAYERS), "u1", ctxAt(T0, seeded(seed)));
      const ids = state.match?.cards.map((c) => c.termId) ?? [];
      expect(new Set(ids).size).toBe(MAX_PLAYERS);
    }
  });
});

describe("полный путь партии", () => {
  it("лобби → раздача → вопрос → ответы → догадка → смена хода → итоги", () => {
    let { state, at } = started(3);
    expect(state.phase).toBe("asking");
    expect(askerOf(state)).toBe("u1");
    ({ state, at } = playTurn(state, at, { votes: { u2: "yes", u3: "yes" }, guess: "  термин   T01 " }));
    expect(state.match?.cards[0]).toMatchObject({ solved: true, score: 100, turnsTaken: 1 });
    expect(askerOf(state)).toBe("u2");
    ({ state, at } = playTurn(state, at, { votes: { u1: "no", u3: "no" }, guess: "Термин t05" }));
    expect(state.match?.cards[1]).toMatchObject({ solved: false, turnsTaken: 1 });
    ({ state, at } = playTurn(state, at, { votes: { u1: "yes", u2: "no" }, guess: "skip" }));
    expect(askerOf(state)).toBe("u2");
    ({ state, at } = playTurn(state, at, { votes: { u1: "yes", u3: "yes" }, guess: "вариант t02" }));
    ({ state, at } = playTurn(state, at, { votes: { u1: "yes", u2: "yes" }, guess: "Термин t03" }));
    expect(state.phase).toBe("finished");
    const result = engine.result(state);
    expect(result).toMatchObject({ outcome: "win", winnerUserIds: ["u1"] });
    expect(result?.scores).toEqual([
      { userId: "u1", score: 100 },
      { userId: "u2", score: 90 },
      { userId: "u3", score: 90 },
    ]);
    const final = engine.project(state, "u2");
    expect(final.cards.every((c) => c.term && c.definition)).toBe(true);
    expect(final.history).toHaveLength(5);
    expect(engine.nextDeadline(state)).toBeNull();
  });

  it("никто не угадал: 8 личных ходов у каждого и ничья без победителя", () => {
    const { state } = started(3);
    const done = engine.advance(state, ctxAt(T0 + 3_600_000));
    expect(done.phase).toBe("finished");
    expect(done.match?.cards.map((c) => c.turnsTaken)).toEqual([8, 8, 8]);
    expect(done.match?.history.every((t) => t.question === null && t.tally === null && t.timedOut === "ask")).toBe(true);
    expect(engine.result(done)).toMatchObject({ outcome: "draw", winnerUserIds: [] });
    const turn = TIMINGS.askMs + TIMINGS.nextTurnMs;
    expect(done.phaseStartedAt).toBe(T0 + TIMINGS.assignMs + 24 * turn);
  });

  it("общий предел партии — 20 минут", () => {
    const { state } = started(MAX_PLAYERS);
    const done = engine.advance(state, ctxAt(T0 + 3_600_000));
    expect(done.phase).toBe("finished");
    expect(done.phaseStartedAt).toBe(T0 + TIMINGS.matchMs);
    expect(done.match?.history.at(-1)?.timedOut).toBe("limit");
    expect(done.match?.cards.some((c) => c.turnsTaken < LIMITS.maxPersonalTurns)).toBe(true);
  });

  it("очки: max(20, 100 − 10 × завершённых ходов до верного)", () => {
    expect([0, 1, 3, 8, 9].map(engine.scoreFor)).toEqual([100, 90, 70, 20, 20]);
  });
});

describe("ходы, голоса и таймеры", () => {
  it("таймаут вопроса передаёт ход без голосования", () => {
    const { state, at } = started();
    const after = engine.advance(state, ctxAt(at + TIMINGS.askMs));
    expect(after.phase).toBe("nextTurn");
    expect(after.match?.history[0]).toMatchObject({ question: null, tally: null, timedOut: "ask" });
    expect(engine.advance(after, ctxAt(at + TIMINGS.askMs + TIMINGS.nextTurnMs)).match?.turn?.askerId).toBe("u2");
  });

  it("таймаут голосования считает только поданные голоса; таймаут догадки завершает ход", () => {
    const { state, at } = started();
    let next = engine.apply(state, { type: "ask", text: "Я служебное слово?" }, "u1", ctxAt(at + 1));
    next = engine.apply(next, { type: "answer", answer: "no" }, "u2", ctxAt(at + 2));
    next = engine.advance(next, ctxAt(at + 1 + TIMINGS.voteMs));
    expect(next.phase).toBe("guessing");
    expect(next.match?.turn).toMatchObject({ tally: { yes: 0, no: 1, ambiguous: 0 }, answer: "no" });
    next = engine.advance(next, ctxAt((next.deadline ?? 0) + 1));
    expect(next.match?.history[0]).toMatchObject({ timedOut: "guess", guess: null });
    expect(next.match?.cards[0]?.turnsTaken).toBe(1);
  });

  it("граница nowMs === deadline: действие уже просрочено", () => {
    const { state } = started();
    const deadline = state.deadline ?? 0;
    expect(() => engine.apply(state, { type: "ask", text: "поздно?" }, "u1", ctxAt(deadline))).toThrow("истекло");
    expect(engine.advance(state, ctxAt(deadline - 1))).toBe(state);
    expect(engine.advance(state, ctxAt(deadline)).phase).toBe("nextTurn");
  });

  it("неоднозначность: равенство лидеров или ноль голосов", () => {
    expect(engine.majorityAnswer({ yes: 1, no: 1, ambiguous: 0 })).toBe("ambiguous");
    expect(engine.majorityAnswer({ yes: 0, no: 0, ambiguous: 0 })).toBe("ambiguous");
    expect(engine.majorityAnswer({ yes: 2, no: 1, ambiguous: 1 })).toBe("yes");
    expect(engine.majorityAnswer({ yes: 1, no: 0, ambiguous: 2 })).toBe("ambiguous");
    let { state, at } = started(5);
    state = engine.apply(state, { type: "ask", text: "Я часть речи?" }, "u1", ctxAt(at + 1));
    for (const [voter, answer] of [["u2", "yes"], ["u3", "no"], ["u4", "yes"], ["u5", "no"]] as [string, Answer][]) state = engine.apply(state, { type: "answer", answer }, voter, ctxAt(at + 2));
    expect(state.match?.turn).toMatchObject({ answer: "ambiguous", tally: { yes: 2, no: 2, ambiguous: 0 } });
  });

  it("каждый отвечает один раз; спрашивающий не отвечает; чужие действия отклоняются", () => {
    const { state, at } = started();
    const now = ctxAt(at + 1);
    expect(() => engine.apply(state, { type: "ask", text: "Я?" }, "u2", now)).toThrow("другой игрок");
    expect(() => engine.apply(state, { type: "answer", answer: "yes" }, "u2", now)).toThrow("не время");
    expect(() => engine.apply(state, { type: "ask", text: "я".repeat(181) }, "u1", now)).toThrow("180");
    expect(() => engine.apply(state, { type: "ask", text: "  " }, "u1", now)).toThrow("пустой");
    const asked = engine.apply(state, { type: "ask", text: "Я пишусь с дефисом?" }, "u1", now);
    expect(() => engine.apply(asked, { type: "answer", answer: "yes" }, "u1", now)).toThrow("Спрашивающий");
    const once = engine.apply(asked, { type: "answer", answer: "yes" }, "u2", now);
    expect(() => engine.apply(once, { type: "answer", answer: "no" }, "u2", now)).toThrow("уже ответили");
    expect(() => engine.apply(once, { type: "guess", text: "x" }, "u1", now)).toThrow("не время");
    expect(() => engine.apply(once, { type: "answer", answer: "yes" }, "u9", now)).toThrowError(expect.objectContaining({ code: "forbidden" }));
    const guessing = engine.apply(once, { type: "answer", answer: "yes" }, "u3", now);
    expect(() => engine.apply(guessing, { type: "guess", text: "x" }, "u2", now)).toThrow("только спрашивающий");
    expect(() => engine.apply(guessing, { type: "skipGuess" }, "u3", now)).toThrow("только спрашивающий");
  });

  it("угадавший остаётся отвечающим, а его ходы пропускаются", () => {
    let { state, at } = started(3);
    ({ state, at } = playTurn(state, at, { votes: { u2: "yes", u3: "yes" }, guess: "Термин t01" }));
    state = engine.apply(state, { type: "ask", text: "Я глагол?" }, "u2", ctxAt(at + 1));
    state = engine.apply(state, { type: "answer", answer: "no" }, "u3", ctxAt(at + 2));
    expect(state.phase).toBe("peerVote");
    state = engine.apply(state, { type: "answer", answer: "no" }, "u1", ctxAt(at + 3));
    expect(state.phase).toBe("guessing");
    state = engine.apply(state, { type: "skipGuess" }, "u2", ctxAt(at + 4));
    state = engine.advance(state, ctxAt(state.deadline ?? 0));
    expect(askerOf(state)).toBe("u3");
    state = engine.advance(state, ctxAt((state.deadline ?? 0) + 5_000));
    expect(askerOf(state)).toBe("u2");
  });

  it("предел восьми личных ходов", () => {
    let { state, at } = started(3);
    for (let i = 0; i < 8; i += 1) {
      while (askerOf(state) !== "u1") state = engine.advance(state, ctxAt(state.deadline ?? at));
      at = state.phaseStartedAt;
      ({ state, at } = playTurn(state, at, { votes: { u2: "no", u3: "no" }, guess: "мимо" }));
    }
    expect(state.match?.cards[0]).toMatchObject({ turnsTaken: 8, solved: false });
    for (let i = 0; i < 6; i += 1) {
      expect(askerOf(state)).not.toBe("u1");
      state = engine.advance(state, ctxAt(state.deadline ?? 0));
    }
  });

  it("сравнение ответа: регистр, пробелы, NFKC; ё/е только по флагу карточки", () => {
    expect(normalizeAnswer("  ТВЁРДЫЙ   знак ", false)).toBe("твёрдый знак");
    expect(matchesAnswer("твердый знак", ["Твёрдый знак"], false)).toBe(false);
    expect(matchesAnswer("твердый знак", ["Твёрдый знак"], true)).toBe(true);
    expect(matchesAnswer("ＳＰＰ", ["SPP"], false)).toBe(true);
    expect(matchesAnswer("существительно", ["Существительное"], true)).toBe(false);
    const yo = { takenAt: 0, terms: [term("y1", { term: "Твёрдый знак", equivalenceYo: false }), term("y2"), term("y3")] };
    let { state, at } = started(3, yo);
    state = engine.apply(state, { type: "ask", text: "Я буква?" }, "u1", ctxAt(at + 1));
    state = engine.advance(state, ctxAt(state.deadline ?? 0));
    const wrong = engine.apply(state, { type: "guess", text: "твердый знак" }, "u1", ctxAt(state.phaseStartedAt + 1));
    expect(wrong.match?.history[0]?.guess).toEqual({ text: "твердый знак", correct: false });
    const right = engine.apply(state, { type: "guess", text: "ТВЁРДЫЙ ЗНАК" }, "u1", ctxAt(state.phaseStartedAt + 1));
    expect(right.match?.cards[0]?.solved).toBe(true);
  });

  it("вышедший спрашивающий завершает ход, вышедший голос не ждут", () => {
    let { state, at } = started(4);
    state = engine.leave(state, "u1", ctxAt(at + 1));
    expect(state.match?.history[0]).toMatchObject({ askerId: "u1", skipped: true });
    state = engine.advance(state, ctxAt(state.deadline ?? 0));
    state = engine.apply(state, { type: "ask", text: "Я?" }, "u2", ctxAt(state.phaseStartedAt + 1));
    state = engine.apply(state, { type: "answer", answer: "yes" }, "u3", ctxAt(state.phaseStartedAt + 2));
    state = engine.leave(state, "u4", ctxAt(state.phaseStartedAt + 3));
    expect(state.phase).toBe("guessing");
  });

  it("реванш через apply запрещён: нужен новый sessionId", () => {
    expect(() => engine.apply(started().state, { type: "rematch" }, "u1", ctxAt(T0))).toThrow("новую сессию");
  });
});

describe("секретность проекции", () => {
  it("своего термина и его вариантов нет в JSON до угадывания; чужие термины видны; варианты не отдаются никогда", () => {
    let { state, at } = started(3);
    const before = JSON.stringify(engine.project(state, "u1"));
    expect(before).not.toContain("Термин t01");
    expect(before).not.toContain("вариант t01");
    expect(before).toContain("Термин t02");
    expect(before).toContain("Термин t03");
    expect(before).not.toMatch(/вариант t0|acceptedAnswers|equivalenceYo|termId|"votes"/);
    ({ state, at } = playTurn(state, at, { votes: { u2: "yes", u3: "yes" }, guess: "Термин t01" }));
    const after = JSON.stringify(engine.project(state, "u1"));
    expect(after).toContain("Термин t01");
    expect(after).not.toContain("вариант t01");
    expect(engine.project(state, "u2").cards.find((c) => c.playerId === "u2")).toMatchObject({ term: null, hidden: true });
  });

  it("числа голосов видны только после завершения голосования", () => {
    const { state, at } = started(4);
    let next = engine.apply(state, { type: "ask", text: "Я часть слова?" }, "u1", ctxAt(at + 1));
    next = engine.apply(next, { type: "answer", answer: "yes" }, "u2", ctxAt(at + 2));
    const during = engine.project(next, "u3");
    expect(during.turn).toMatchObject({ votedIds: ["u2"], tally: null, answer: null, myAnswer: null });
    expect(engine.project(next, "u2").turn?.myAnswer).toBe("yes");
    next = engine.advance(next, ctxAt(next.deadline ?? 0));
    expect(engine.project(next, "u3").turn?.tally).toEqual({ yes: 1, no: 0, ambiguous: 0 });
  });

  it("зритель не видит неугаданных терминов", () => {
    const view = engine.project(started().state, "spectator");
    expect(view.cards.every((c) => c.term === null)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Термин t0");
  });
});

describe("неизменность, сериализация, восстановление", () => {
  it("функции не мутируют вход", () => {
    const lobby = deepFreeze(readyLobby(3));
    const s = deepFreeze(engine.start(lobby, "u1", ctxAt(T0)));
    const asking = deepFreeze(engine.advance(s, ctxAt(T0 + TIMINGS.assignMs)));
    const asked = deepFreeze(engine.apply(asking, { type: "ask", text: "Я?" }, "u1", ctxAt(T0 + TIMINGS.assignMs + 1)));
    deepFreeze(engine.apply(asked, { type: "answer", answer: "yes" }, "u2", ctxAt(T0 + TIMINGS.assignMs + 2)));
    deepFreeze(engine.leave(asking, "u3", ctxAt(T0 + TIMINGS.assignMs + 1)));
    deepFreeze(engine.syncPresence(asking, {}, T0 + 100_000));
    deepFreeze(engine.project(asked, "u1"));
    expect(lobby.phase).toBe("lobby");
  });

  it("JSON round-trip и восстановление после рестарта дают то же продолжение", () => {
    const { state } = started();
    const restored = JSON.parse(JSON.stringify(state)) as State;
    expect(restored).toEqual(state);
    const later = ctxAt(T0 + 200_000);
    expect(engine.advance(restored, later)).toEqual(engine.advance(state, later));
  });

  it("присутствие: передача ведущего через 45 с и отмена через 10 минут", () => {
    const { state, at } = started();
    const now = at + 50_000;
    expect(engine.syncPresence(state, { u1: now - 46_000, u2: now - 1_000, u3: now }, now).hostId).toBe("u2");
    expect(engine.syncPresence(state, { u1: now - 10_000, u2: now, u3: now }, now).hostId).toBe("u1");
    const gone = engine.syncPresence(state, { u1: 0, u2: 0, u3: 0 }, 700_000);
    expect(engine.result(gone)).toMatchObject({ outcome: "cancelled", winnerUserIds: [] });
    expect(engine.absenceCutoff(state, { u1: 5, u2: 9, u3: 1 })).toBe(9 + 600_000);
  });

  it("реванш: новая сессия, сброс готовности, по возможности новые термины", () => {
    const finished = engine.advance(started().state, ctxAt(T0 + 3_600_000));
    const next = engine.rematch(finished, "s2", "u1", ctxAt(T0 + 3_600_001));
    expect(next).toMatchObject({ sessionId: "s2", phase: "lobby", previousTermIds: ["t01", "t02", "t03"] });
    expect(next.participants.every((p) => !p.ready)).toBe(true);
    const ready = { ...next, participants: next.participants.map((p) => ({ ...p, ready: true })) };
    const again = engine.start(ready, "u1", ctxAt(T0));
    expect(again.match?.cards.map((c) => c.termId)).toEqual(["t04", "t05", "t06"]);
    expect(() => engine.rematch(finished, "s3", "u2", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "forbidden" }));
  });
});

describe("исключение EngineError", () => {
  it("имеет код", () => {
    expect(new EngineError("rate", "x").code).toBe("rate");
  });
});
