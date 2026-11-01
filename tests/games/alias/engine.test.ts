import { describe, expect, it } from "vitest";
import * as engine from "../../../server/games/alias/engine";
import { EngineError } from "../../../server/games/alias/engine";
import { LIMITS, MAX_PLAYERS, TIMINGS, type State } from "../../../shared/games/alias/types";
import { answerKey, findForbidden } from "../../../shared/games/alias/text";
import { card, CONTENT, ctxAt, deepFreeze, PLAYERS, readyLobby, seeded, SETTINGS } from "./helpers";

const T0 = 1_000;
const EXPLAIN_AT = T0 + TIMINGS.prepareMs;

/** Старт 4 игроков: команды [u1,u3] и [u2,u4], колода c1…c40 по порядку. */
function started(n = 4, settings = SETTINGS): State {
  return engine.start(readyLobby(n, CONTENT, settings), "u1", ctxAt(T0));
}

function explaining(n = 4): State {
  return engine.advance(started(n), ctxAt(EXPLAIN_AT));
}

function seq(state: State): number {
  return engine.project(state, "u1").cardSeq ?? 0;
}

describe("создание и лобби", () => {
  it("пустой состав — отдельное исключение", () => {
    expect(() => engine.create({ sessionId: "s", hostId: "u1", participants: [], settings: SETTINGS, contentSnapshot: CONTENT, ctx: ctxAt(0) })).toThrowError(
      expect.objectContaining({ code: "empty" }),
    );
  });

  it("новые игроки равномерно попадают в команды", () => {
    const state = readyLobby(5);
    expect(state.participants.map((p) => p.team)).toEqual([0, 1, 0, 1, 0]);
  });

  it("минимум 4 игрока и по 2 в каждой команде", () => {
    expect(engine.startBlockers(readyLobby(3)).join(" ")).toContain("минимум 4");
    const lopsided = engine.apply(readyLobby(4), { type: "assignTeam", userId: "u2", team: 0 }, "u1", ctxAt(T0));
    expect(engine.startBlockers(lopsided).join(" ")).toContain("Пружины");
    expect(() => engine.start(lopsided, "u1", ctxAt(T0))).toThrow(EngineError);
  });

  it("максимум 16: семнадцатый не входит, 4 команды по 4 стартуют", () => {
    const full = readyLobby(MAX_PLAYERS, CONTENT, { teamCount: 4, rounds: 3 });
    expect(() => engine.join(full, PLAYERS[16] as { id: string; username: string }, ctxAt(T0))).toThrow("16");
    expect(engine.start(full, "u1", ctxAt(T0)).phase).toBe("prepare");
  });

  it("меньше 30 карточек и пустой пул: старт запрещён", () => {
    const few = readyLobby(4, { takenAt: 0, cards: CONTENT.cards.slice(0, 29) });
    expect(() => engine.start(few, "u1", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "content" }));
    expect(engine.project(few, "u1").startBlockers.join(" ")).toContain("30");
    expect(() => engine.start(readyLobby(4, { takenAt: 0, cards: [] }), "u1", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "content" }));
  });

  it("ручное назначение и авторазбиение — только ведущий и только в лобби", () => {
    const lobby = readyLobby(6);
    expect(() => engine.apply(lobby, { type: "assignTeam", userId: "u3", team: 1 }, "u2", ctxAt(T0))).toThrowError(expect.objectContaining({ code: "forbidden" }));
    expect(() => engine.apply(lobby, { type: "assignTeam", userId: "u3", team: 3 }, "u1", ctxAt(T0))).toThrow("Такой команды нет");
    const moved = engine.apply(lobby, { type: "assignTeam", userId: "u3", team: 1 }, "u1", ctxAt(T0));
    expect(moved.participants.find((p) => p.id === "u3")?.team).toBe(1);
    const balanced = engine.apply(moved, { type: "autoTeams" }, "u1", ctxAt(T0, seeded(3)));
    const sizes = [0, 1].map((t) => balanced.participants.filter((p) => p.team === t).length);
    expect(sizes).toEqual([3, 3]);
    expect(() => engine.apply(started(), { type: "autoTeams" }, "u1", ctxAt(T0))).toThrow("только в лобби");
  });

  it("смена числа команд переносит игроков из исчезнувших команд", () => {
    const four = engine.apply(readyLobby(8), { type: "settings", settings: { teamCount: 4, rounds: 3 } }, "u1", ctxAt(T0));
    const balanced = engine.apply(four, { type: "autoTeams" }, "u1", ctxAt(T0));
    expect(new Set(balanced.participants.map((p) => p.team))).toEqual(new Set([0, 1, 2, 3]));
    const two = engine.apply(balanced, { type: "settings", settings: { teamCount: 2, rounds: 3 } }, "u1", ctxAt(T0));
    expect(two.participants.every((p) => p.team < 2)).toBe(true);
    expect(engine.startBlockers(two)).toEqual([]);
  });

  it("после старта новые игроки не входят", () => {
    expect(() => engine.join(started(), { id: "u9", username: "Новый" }, ctxAt(T0))).toThrow("началась");
  });
});

describe("ход: объяснение, ответы, пропуск", () => {
  it("подготовка 5 с показывает команду, затем объясняющему выдаётся карточка", () => {
    const prepare = started();
    expect(prepare.phase).toBe("prepare");
    expect(engine.project(prepare, "u3")).toMatchObject({ activeTeam: 0, explainerId: "u1", card: null });
    const live = engine.advance(prepare, ctxAt(EXPLAIN_AT));
    expect(live.phase).toBe("explaining");
    expect(engine.project(live, "u1").card).toMatchObject({ term: "Термин1" });
    expect(engine.project(live, "u3").card).toBeNull();
    expect(engine.project(live, "u2").card).toBeNull();
    expect(engine.project(live, "u3").myRole).toBe("guesser");
    expect(engine.project(live, "u2").myRole).toBe("observer");
  });

  it("верный ответ: +1, термин открыт всем, следующая карточка", () => {
    const live = explaining();
    const next = engine.apply(live, { type: "guess", text: "  ТЕРМИН1! ", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1_000));
    expect(next.teams[0]?.score).toBe(1);
    expect(seq(next)).toBe(2);
    expect(engine.project(next, "u2").revealed).toEqual([{ seq: 1, term: "Термин1", outcome: "guessed", guessedBy: "u3" }]);
    expect(engine.project(next, "u1").card?.term).toBe("Термин2");
  });

  it("допустимый ответ из acceptedAnswers тоже засчитывается, неверный — нет", () => {
    const live = explaining();
    const wrong = engine.apply(live, { type: "guess", text: "не то", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 100));
    expect(wrong.teams[0]?.score).toBe(0);
    const right = engine.apply(wrong, { type: "guess", text: "Ответ1", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1_000));
    expect(right.teams[0]?.score).toBe(1);
  });

  it("двойное угадывание в одной миллисекунде даёт ровно одно очко", () => {
    const five = engine.advance(started(5), ctxAt(EXPLAIN_AT));
    const first = engine.apply(five, { type: "guess", text: "термин1", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 500));
    expect(() => engine.apply(first, { type: "guess", text: "термин1", cardSeq: 1 }, "u5", ctxAt(EXPLAIN_AT + 500))).toThrow("сменилась");
    expect(first.teams[0]?.score).toBe(1);
    expect(five.teams[0]?.score).toBe(0);
  });

  it("пропуск: −1, счёт может стать отрицательным; пропускает только объясняющий", () => {
    const live = explaining();
    expect(() => engine.apply(live, { type: "skip", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1))).toThrow("только объясняющий");
    const skipped = engine.apply(live, { type: "skip", cardSeq: 1 }, "u1", ctxAt(EXPLAIN_AT + 1));
    const twice = engine.apply(skipped, { type: "skip", cardSeq: 2 }, "u1", ctxAt(EXPLAIN_AT + 2));
    expect(twice.teams[0]?.score).toBe(-2);
    expect(() => engine.apply(twice, { type: "skip", cardSeq: 2 }, "u1", ctxAt(EXPLAIN_AT + 3))).toThrow("сменилась");
    expect(engine.project(twice, "u2").revealed).toEqual([]);
  });

  it("авторство: объясняет только объясняющий, он не угадывает, другая команда не угадывает", () => {
    const live = explaining();
    expect(() => engine.apply(live, { type: "explain", text: "подсказка" }, "u3", ctxAt(EXPLAIN_AT + 1))).toThrow("Объясняет только");
    expect(() => engine.apply(live, { type: "guess", text: "термин1", cardSeq: 1 }, "u1", ctxAt(EXPLAIN_AT + 1))).toThrow("не угадывает");
    expect(() => engine.apply(live, { type: "guess", text: "термин1", cardSeq: 1 }, "u2", ctxAt(EXPLAIN_AT + 1))).toThrow("другая команда");
    expect(() => engine.apply(live, { type: "guess", text: "x", cardSeq: 1 }, "u9", ctxAt(EXPLAIN_AT + 1))).toThrowError(expect.objectContaining({ code: "forbidden" }));
    const explained = engine.apply(live, { type: "explain", text: "Это часть речи" }, "u1", ctxAt(EXPLAIN_AT + 1));
    expect(engine.project(explained, "u2").explanations.map((e) => [e.authorId, e.text])).toEqual([["u1", "Это часть речи"]]);
  });

  it("фильтр: термин, формы, запреты с пунктуацией и ё/е; без ложных срабатываний на подстроку", () => {
    const live = explaining();
    const at = ctxAt(EXPLAIN_AT + 1);
    const tries = ["Это ТЕРМИН1, да", "термин1ами называют", "КОТ!", "две, точки", "две точки"];
    for (const text of tries.filter((t) => t !== "две, точки")) {
      expect(() => engine.apply(live, { type: "explain", text }, "u1", at)).toThrow("запрещённое");
    }
    expect(engine.apply(live, { type: "explain", text: "который котёл — не котик" }, "u1", at).match?.turns[0]?.explanations).toHaveLength(1);
    expect(findForbidden("две, точки", ["две точки"])).toBe("две точки");
    expect(findForbidden("Ёжик", ["ежик"])).toBe("ежик");
    expect(findForbidden("скоро", ["кот"])).toBeNull();
  });

  it("отклонённое объяснение не меняет состояние, не штрафует и не раскрывает слово другим", () => {
    const live = deepFreeze(explaining());
    let message = "";
    try {
      engine.apply(live, { type: "explain", text: "термин1" }, "u1", ctxAt(EXPLAIN_AT + 1));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("таймер идёт");
    expect(live.teams[0]?.score).toBe(0);
    expect(live.deadline).toBe(EXPLAIN_AT + TIMINGS.explainMs);
    expect(JSON.stringify(engine.project(live, "u2"))).not.toMatch(/Термин1|термин1/);
  });

  it("частота ответов: не чаще 800 мс на игрока", () => {
    const live = explaining();
    const one = engine.apply(live, { type: "guess", text: "раз", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 100));
    expect(() => engine.apply(one, { type: "guess", text: "два", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 100 + LIMITS.guessIntervalMs - 1))).toThrowError(
      expect.objectContaining({ code: "rate" }),
    );
    expect(engine.apply(one, { type: "guess", text: "два", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 100 + LIMITS.guessIntervalMs)).match?.turns[0]?.guesses).toHaveLength(2);
  });

  it("лимиты текста: объяснение 300, ответ 100, пустой текст", () => {
    const live = explaining();
    expect(() => engine.apply(live, { type: "explain", text: "я".repeat(301) }, "u1", ctxAt(EXPLAIN_AT + 1))).toThrow("300");
    expect(() => engine.apply(live, { type: "guess", text: "я".repeat(101), cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1))).toThrow("100");
    expect(() => engine.apply(live, { type: "guess", text: "  ", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1))).toThrow("пустой");
  });

  it("ответы видит только своя команда; зритель не видит ни термина, ни ответов", () => {
    const live = engine.apply(explaining(), { type: "guess", text: "мой вариант", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1));
    expect(engine.project(live, "u1").guesses).toHaveLength(1);
    expect(engine.project(live, "u3").guesses).toHaveLength(1);
    expect(engine.project(live, "u2").guesses).toEqual([]);
    const spectator = JSON.stringify(engine.project(live, "spectator"));
    expect(spectator).not.toMatch(/мой вариант|Термин1|термин1|запрет1/);
  });
});

describe("таймеры", () => {
  it("конец таймера: текущая карточка без штрафа и открывается всем в итоге хода", () => {
    const live = explaining();
    const ended = engine.advance(live, ctxAt(EXPLAIN_AT + TIMINGS.explainMs));
    expect(ended.phase).toBe("turnResult");
    expect(ended.teams[0]?.score).toBe(0);
    expect(engine.project(ended, "u2").lastTurn?.cards).toEqual([{ seq: 1, term: "Термин1", outcome: "expired", guessedBy: null }]);
  });

  it("граница nowMs === deadline: ответ уже просрочен", () => {
    const live = explaining();
    const deadline = live.deadline ?? 0;
    expect(() => engine.apply(live, { type: "guess", text: "термин1", cardSeq: 1 }, "u3", ctxAt(deadline))).toThrow("истекло");
    expect(engine.advance(live, ctxAt(deadline - 1))).toBe(live);
    expect(engine.advance(live, ctxAt(deadline)).phase).toBe("turnResult");
  });

  it("истёкшая карточка: ответ по её номеру после смены хода отклоняется", () => {
    const live = explaining();
    const next = engine.advance(live, ctxAt(EXPLAIN_AT + TIMINGS.explainMs + TIMINGS.turnResultMs + TIMINGS.prepareMs));
    expect(next.phase).toBe("explaining");
    expect(() => engine.apply(next, { type: "guess", text: "термин1", cardSeq: 1 }, "u4", ctxAt(next.phaseStartedAt + 10))).toThrow("сменилась");
  });

  it("одинаковое число ходов у всех команд, ротация объясняющих, финал по таймеру", () => {
    const state = started(6, { teamCount: 3, rounds: 4 });
    const all = engine.advance(state, ctxAt(T0 + 3_600_000));
    expect(all.phase).toBe("finished");
    expect(all.teams.map((t) => t.turnsPlayed)).toEqual([4, 4, 4]);
    const explainers = all.match?.turns.filter((t) => t.team === 0).map((t) => t.explainerId);
    expect(explainers).toEqual(["u1", "u4", "u1", "u4"]);
    const turnLength = TIMINGS.prepareMs + TIMINGS.explainMs + TIMINGS.turnResultMs;
    expect(all.phaseStartedAt).toBe(T0 + 12 * turnLength);
    expect(engine.result(all)).toMatchObject({ outcome: "win" });
  });

  it("ничья: совместная победа всех команд с максимумом", () => {
    const all = engine.advance(started(), ctxAt(T0 + 3_600_000));
    expect(all.outcome?.winnerTeams).toEqual([0, 1]);
    expect(engine.result(all)?.winnerUserIds.sort()).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("побеждает команда с максимумом; каждому участнику — счёт команды", () => {
    let state = explaining();
    state = engine.apply(state, { type: "guess", text: "термин1", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 10));
    const done = engine.advance(state, ctxAt(T0 + 3_600_000));
    const result = engine.result(done);
    expect(result?.winnerUserIds.sort()).toEqual(["u1", "u3"]);
    expect(result?.scores).toContainEqual({ userId: "u2", score: 0 });
    expect(result?.scores).toContainEqual({ userId: "u3", score: 1 });
  });

  it("исчерпание колоды завершает ход; следующий ход перемешивает колоду заново", () => {
    let state = explaining();
    for (let i = 1; i <= 40; i += 1) state = engine.apply(state, { type: "skip", cardSeq: i }, "u1", ctxAt(EXPLAIN_AT + i));
    expect(state.phase).toBe("turnResult");
    expect(state.match?.turns[0]?.endedBy).toBe("deck");
    expect(state.teams[0]?.score).toBe(-40);
    const next = engine.advance(state, ctxAt(state.deadline ?? 0));
    expect(next.phase).toBe("prepare");
    expect(next.match?.deck).toHaveLength(40);
    const live = engine.advance(next, ctxAt(next.deadline ?? 0));
    expect(live.phase).toBe("explaining");
    expect(engine.project(live, "u2").card?.term).toBe("Термин1");
  });

  it("вышедший объясняющий завершает ход сразу; следующий ход у следующего участника", () => {
    const live = explaining();
    const left = engine.leave(live, "u1", ctxAt(EXPLAIN_AT + 5));
    expect(left.phase).toBe("turnResult");
    expect(left.match?.turns[0]?.endedBy).toBe("explainerLeft");
    const all = engine.advance(left, ctxAt(T0 + 3_600_000));
    expect(all.match?.turns.filter((t) => t.team === 0).map((t) => t.explainerId)).toEqual(["u1", "u3", "u3"]);
  });
});

describe("неизменность, сериализация, восстановление, присутствие", () => {
  it("функции не мутируют вход", () => {
    const lobby = deepFreeze(readyLobby(4));
    const s = deepFreeze(engine.start(lobby, "u1", ctxAt(T0)));
    const live = deepFreeze(engine.advance(s, ctxAt(EXPLAIN_AT)));
    deepFreeze(engine.apply(live, { type: "guess", text: "термин1", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 1)));
    deepFreeze(engine.apply(live, { type: "skip", cardSeq: 1 }, "u1", ctxAt(EXPLAIN_AT + 1)));
    deepFreeze(engine.leave(live, "u2", ctxAt(EXPLAIN_AT + 1)));
    deepFreeze(engine.syncPresence(live, {}, EXPLAIN_AT + 100_000));
    deepFreeze(engine.project(live, "u1"));
    expect(lobby.phase).toBe("lobby");
  });

  it("JSON round-trip и восстановление после рестарта дают то же продолжение", () => {
    const live = explaining();
    const restored = JSON.parse(JSON.stringify(live)) as State;
    expect(restored).toEqual(live);
    const later = ctxAt(T0 + 500_000);
    expect(engine.advance(restored, later)).toEqual(engine.advance(live, later));
  });

  it("передача ведущего через 45 с и отмена через 10 минут", () => {
    const live = explaining();
    const now = EXPLAIN_AT + 50_000;
    expect(engine.syncPresence(live, { u1: now - 46_000, u2: now - 1_000, u3: now, u4: now }, now).hostId).toBe("u2");
    const gone = engine.syncPresence(live, { u1: 0, u2: 0, u3: 0, u4: 0 }, 700_000);
    expect(gone.phase).toBe("cancelled");
    expect(engine.result(gone)).toMatchObject({ outcome: "cancelled", winnerUserIds: [] });
    expect(engine.absenceCutoff(live, { u1: 5, u2: 9, u3: 1, u4: 2 })).toBe(9 + 600_000);
  });

  it("реванш: новая сессия, те же команды, сброс готовности и счёта", () => {
    const finished = engine.advance(started(), ctxAt(T0 + 3_600_000));
    expect(() => engine.apply(finished, { type: "rematch" }, "u1", ctxAt(T0))).toThrow("новую сессию");
    const next = engine.rematch(finished, "s2", "u1", ctxAt(T0 + 3_600_001));
    expect(next).toMatchObject({ sessionId: "s2", phase: "lobby" });
    expect(next.participants.map((p) => [p.id, p.team, p.ready])).toEqual([
      ["u1", 0, false],
      ["u2", 1, false],
      ["u3", 0, false],
      ["u4", 1, false],
    ]);
    expect(next.teams.every((t) => t.score === 0)).toBe(true);
  });

  it("финал: принятые термины, пропуски и определения по командам", () => {
    let state = explaining();
    state = engine.apply(state, { type: "guess", text: "термин1", cardSeq: 1 }, "u3", ctxAt(EXPLAIN_AT + 10));
    state = engine.apply(state, { type: "skip", cardSeq: 2 }, "u1", ctxAt(EXPLAIN_AT + 20));
    const done = engine.advance(state, ctxAt(T0 + 3_600_000));
    const history = engine.project(done, "u2").history;
    expect(history?.[0]?.accepted.map((c) => c.term)).toEqual(["Термин1"]);
    expect(history?.[0]?.skipped).toEqual([{ term: "Термин2", definition: card(2).definition, outcome: "skipped", guessedBy: null }]);
    expect(history?.[0]?.expired.length).toBeGreaterThan(0);
  });

  it("сравнение ответов: регистр, ё/е, пробелы и пунктуация", () => {
    expect(answerKey("  Имя  СУЩЕСТВИТЕЛЬНОЕ! ")).toBe(answerKey("имя существительное"));
    expect(answerKey("Ёлочки")).toBe(answerKey("елочки"));
  });
});
