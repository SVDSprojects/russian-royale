import { describe, it, expect } from "vitest";
import {
  create,
  apply,
  advance,
  project,
  result,
  nextDeadline,
  joinParticipant,
  leaveParticipant,
} from "../../../server/games/roulette/engine";
import {
  ActionSchema,
  ContentSchema,
  StateSchema,
  ViewSchema,
  SettingsSchema,
  ResultSchema,
  defaultSettings,
  normalize,
  isCorrect,
  contentIssues,
  type State,
  type Context,
  type Action,
} from "../../../shared/games/roulette/types";
import raw from "../../../server/games/roulette/initial-content.json" with { type: "json" };
const content = ContentSchema.parse(raw);
const context = (nowMs = 100000): Context => ({ nowMs, randomInt: () => 0 });
function lobby(n = 2, settings = defaultSettings): State {
  return create({
    sessionId: "session_1",
    hostId: "u1",
    participants: Array.from({ length: n }, (_, i) => ({
      id: `u${i + 1}`,
      username: `Игрок ${i + 1}`,
    })),
    settings,
    contentSnapshot: content,
    ctx: context(),
  });
}
function start(n = 2, settings = defaultSettings): State {
  let s = lobby(n, settings);
  for (const p of s.players)
    s = apply(s, { type: "ready", ready: true }, p.id, context());
  return apply(s, { type: "start" }, "u1", context());
}
function atDeadline(s: State): State {
  return advance(s, context(s.deadline!));
}
function until(s: State, phase: State["phase"]): State {
  for (let i = 0; i < 300 && s.phase !== phase; i++) s = atDeadline(s);
  return s;
}
describe("Контракт и общие правила", () => {
  it("строгие runtime-валидаторы не принимают лишние поля и неверные типы", () => {
    expect(() =>
      SettingsSchema.parse({ ...defaultSettings, admin: true }),
    ).toThrow();
    expect(() =>
      ActionSchema.parse({ type: "ready", ready: "true" }),
    ).toThrow();
    expect(() =>
      ActionSchema.parse({ type: "answer", text: "a", score: 100 }),
    ).toThrow();
    expect(() => ContentSchema.parse({ ...content, secret: true })).toThrow();
    expect(() =>
      StateSchema.parse({ ...lobby(), deadline: Infinity }),
    ).toThrow();
    expect(() =>
      ViewSchema.parse({ ...project(lobby(), "u1"), state: {} }),
    ).toThrow();
    expect(() => ResultSchema.parse({})).toThrow();
  });
  it("допускает минимальное и максимальное число игроков", () => {
    expect(start(2).players).toHaveLength(2);
    expect(start(16).players).toHaveLength(16);
    expect(() => lobby(17)).toThrow();
    expect(() => lobby(0)).toThrow();
  });
  it("нельзя стартовать одному, без готовности, чужим ведущим или повторно", () => {
    let s = lobby(1);
    s = apply(s, { type: "ready", ready: true }, "u1", context());
    expect(() => apply(s, { type: "start" }, "u1", context())).toThrow();
    expect(() => apply(lobby(), { type: "start" }, "u1", context())).toThrow();
    expect(() => apply(start(), { type: "start" }, "u2", context())).toThrow();
    expect(() => apply(start(), { type: "start" }, "u1", context())).toThrow();
  });
  it("пустой набор и неопубликованные карточки блокируют старт", () => {
    let s = lobby();
    s.contentSnapshot.questions = [];
    s.players.forEach((p) => (p.ready = true));
    expect(() => apply(s, { type: "start" }, "u1", context())).toThrow();
    expect(
      contentIssues({
        ...content,
        questions: content.questions.map((q) => ({ ...q, status: "draft" })),
      }),
    ).not.toHaveLength(0);
  });
  it("вход не мутируется; JSON round-trip восстанавливает тот же View", () => {
    const s = start(),
      before = JSON.stringify(s);
    const a = advance(s, context(s.deadline!));
    expect(JSON.stringify(s)).toBe(before);
    expect(project(JSON.parse(JSON.stringify(a)) as State, "u1")).toEqual(
      project(a, "u1"),
    );
  });
  it("догоняет просроченные фазы без сдвига дедлайна от перезагрузки", () => {
    let stepped = start();
    const target = 100000 + 120000;
    while (stepped.deadline !== null && stepped.deadline <= target)
      stepped = atDeadline(stepped);
    expect(advance(start(), context(target))).toEqual(stepped);
  });
  it("полная партия по таймаутам заканчивается ничьей и стабильным результатом", () => {
    let s = start();
    for (let i = 0; i < 200 && s.phase !== "finished"; i++) s = atDeadline(s);
    expect(s.phase).toBe("finished");
    expect(result(s)?.outcome).toBe("draw");
    expect(result(s)?.winnerUserIds).toEqual(["u1", "u2"]);
    expect(result(s)).toEqual(result(s));
    expect(nextDeadline(s)).toBeNull();
  });
  it("чужой участник не получает View и не может действовать", () => {
    expect(() => project(start(), "outsider")).toThrow();
    expect(() =>
      apply(start(), { type: "cancel" }, "outsider", context()),
    ).toThrow();
  });
  it("отмена только ведущим; после отмены действия запрещены", () => {
    const s = start();
    expect(() => apply(s, { type: "cancel" }, "u2", context())).toThrow();
    const c = apply(s, { type: "cancel" }, "u1", context());
    expect(result(c)?.outcome).toBe("cancelled");
    expect(result(c)?.winnerUserIds).toEqual([]);
    expect(() =>
      apply(c, { type: "ready", ready: true }, "u1", context()),
    ).toThrow();
  });
  it("ведущий передаёт управление ровно после 45 секунд отсутствия", () => {
    const s = lobby();
    s.players[0]!.online = false;
    s.players[0]!.offlineSince = 100000;
    expect(advance(s, context(144999)).hostId).toBe("u1");
    expect(nextDeadline(s)).toBe(145000);
    expect(advance(s, context(145000)).hostId).toBe("u2");
  });
  it("все отсутствуют 10 минут — отмена; завершившаяся раньше партия не отменяется", () => {
    const s = lobby();
    s.players.forEach((p) => {
      p.online = false;
      p.offlineSince = 100000;
    });
    expect(advance(s, context(699999)).phase).toBe("lobby");
    expect(result(advance(s, context(700000)))?.outcome).toBe("cancelled");
    const active = start();
    active.players.forEach((p) => {
      p.online = false;
      p.offlineSince = 100000;
    });
    const end = advance(active, context(10000000));
    expect(result(end)?.outcome).toBe("draw");
  });
  it("выход из лобби и пустой состав, активная партия сохраняет место", () => {
    let s = lobby();
    s = leaveParticipant(s, "u1", context());
    expect(s.hostId).toBe("u2");
    s = leaveParticipant(s, "u2", context());
    expect(result(s)?.outcome).toBe("cancelled");
    const active = leaveParticipant(start(), "u1", context());
    expect(active.players).toHaveLength(2);
    expect(active.players[0]!.online).toBe(false);
  });
  it("новые игроки не входят после старта", () => {
    expect(
      joinParticipant(lobby(), { id: "u3", username: "Третий" }).players,
    ).toHaveLength(3);
    expect(() =>
      joinParticipant(start(), { id: "u3", username: "Третий" }),
    ).toThrow();
  });
  it("ё/е, регистр, пробелы и пунктуация сохраняются без явной нормализации", () => {
    const exact = {
      trim: false,
      caseFold: false,
      collapseSpaces: false,
      foldYo: false,
      stripPunctuation: false,
    };
    expect(normalize(" Ёж! ", exact)).toBe(" Ёж! ");
    expect(
      isCorrect(
        {
          ...content.questions[0]!,
          acceptedAnswers: ["Ёж!"],
          normalization: exact,
        },
        "еж",
      ),
    ).toBe(false);
    expect(
      normalize(" ЁЖ! ", {
        trim: true,
        caseFold: true,
        collapseSpaces: true,
        foldYo: true,
        stripPunctuation: true,
      }),
    ).toBe("еж");
  });
  it("серверный снимок не зависит от последующего редактирования источника", () => {
    const source = structuredClone(content);
    const s = create({
      sessionId: "s",
      hostId: "u1",
      participants: [{ id: "u1", username: "А" }],
      settings: defaultSettings,
      contentSnapshot: source,
      ctx: context(),
    });
    source.questions[0]!.acceptedAnswers = ["изменено"];
    expect(s.contentSnapshot.questions[0]!.acceptedAnswers).toEqual(
      content.questions[0]!.acceptedAnswers,
    );
  });
});

describe("Колесо и три режима", () => {
  it("выбранный сектор и вопрос переживают перезапуск", () => {
    const s = start();
    expect(s.phase).toBe("spin");
    expect(
      advance(JSON.parse(JSON.stringify(s)) as State, context(101999)),
    ).toEqual(s);
    expect(project(s, "u1").question).toBeNull();
  });
  it("до reveal нет правильности, объяснений и чужих выборов", () => {
    let s = until(start(), "question");
    const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
    s = apply(
      s,
      { type: "answer", text: q.acceptedAnswers[0]! },
      "u1",
      context(s.phaseStartedAt + 5),
    );
    for (const id of ["u1", "u2"]) {
      const json = JSON.stringify(project(s, id));
      expect(json).not.toContain("acceptedAnswers");
      expect(json).not.toContain(q.explanation);
      expect(project(s, id).players.map((p) => p.score)).toEqual([0, 0]);
      expect(project(s, id).answeredUserIds).toEqual(["u1"]);
    }
  });
  it("ровно один ответ; до вопроса и на дедлайне ответ запрещён", () => {
    const spin = start();
    expect(() =>
      apply(spin, { type: "answer", text: "a" }, "u1", context()),
    ).toThrow();
    let s = atDeadline(spin);
    s = apply(
      s,
      { type: "answer", text: "a" },
      "u1",
      context(s.phaseStartedAt + 1),
    );
    expect(() =>
      apply(
        s,
        { type: "answer", text: "b" },
        "u1",
        context(s.phaseStartedAt + 2),
      ),
    ).toThrow();
    expect(() =>
      apply(s, { type: "answer", text: "b" }, "u2", context(s.deadline!)),
    ).toThrow();
  });
  for (const mode of ["points", "speed", "elimination"] as const)
    it(`формула режима ${mode}`, () => {
      let s = until(start(2, { ...defaultSettings, mode }), "question");
      const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!,
        startAt = s.phaseStartedAt;
      s = apply(
        s,
        { type: "answer", text: q.acceptedAnswers[0]! },
        "u1",
        context(startAt + 15000),
      );
      s = apply(
        s,
        { type: "answer", text: "НЕВЕРНО" },
        "u2",
        context(startAt + 15001),
      );
      expect(s.phase).toBe("reveal");
      expect(s.players[0]!.score).toBe(
        mode === "speed" ? 125 : mode === "points" ? 100 : 0,
      );
      expect(s.players[1]!.score).toBe(0);
      expect(s.players[0]!.lives).toBe(2);
      expect(s.players[1]!.lives).toBe(mode === "elimination" ? 1 : 2);
    });
  it("все выбывают одновременно — совместная победа живых на начало раунда", () => {
    const s = advance(
      start(2, { ...defaultSettings, mode: "elimination" }),
      context(1000000),
    );
    expect(result(s)?.outcome).toBe("draw");
    expect(result(s)?.winnerUserIds).toEqual(["u1", "u2"]);
    expect(s.round).toBe(2);
  });
  it("последний живой выигрывает; выбывший остаётся зрителем", () => {
    let s = start(3, { ...defaultSettings, mode: "elimination" });
    for (let r = 0; r < 2; r++) {
      s = until(s, "question");
      const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
      for (const id of ["u1", "u2", "u3"])
        s = apply(
          s,
          {
            type: "answer",
            text: id === "u1" ? q.acceptedAnswers[0]! : "ошибка",
          },
          id,
          context(s.phaseStartedAt + 1),
        );
      s = until(s, r === 1 ? "finished" : "spin");
    }
    expect(result(s)?.winnerUserIds).toEqual(["u1"]);
    expect(project(s, "u2").result).not.toBeNull();
    expect(() =>
      apply(s, { type: "answer", text: "a" }, "u2", context()),
    ).toThrow();
  });
  it("12 раундов: сначала жизни, затем верные ответы", () => {
    let s = start(2, { ...defaultSettings, mode: "elimination" });
    for (let i = 0; i < 12; i++) {
      s = until(s, "question");
      const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
      for (const id of ["u1", "u2"])
        s = apply(
          s,
          { type: "answer", text: q.acceptedAnswers[0]! },
          id,
          context(s.phaseStartedAt + 1),
        );
      s = until(s, i === 11 ? "finished" : "spin");
    }
    expect(s.round).toBe(12);
    expect(result(s)?.outcome).toBe("draw");
    expect(s.players.every((p) => p.correct === 12 && p.lives === 2)).toBe(
      true,
    );
  });
  it("без повторов до исчерпания пула; сложность и время возрастают по плану", () => {
    let s = start();
    const chosen: string[] = [];
    for (let i = 1; i <= 10; i++) {
      s = until(s, "question");
      expect(s.deadline! - s.phaseStartedAt).toBe(
        i <= 3 ? 30000 : i <= 6 ? 25000 : 20000,
      );
      chosen.push(s.currentId!);
      s = until(s, i === 10 ? "finished" : "spin");
    }
    expect(new Set(chosen).size).toBe(10);
  });
  it("пустая категория исключена; выбор сначала категории, потом карточки", () => {
    let s = lobby();
    s.contentSnapshot.categories.push({
      id: "empty",
      label: "Пустая",
      color: "#ffffff",
    });
    s.players.forEach((p) => (p.ready = true));
    const calls: number[] = [];
    s = apply(s, { type: "start" }, "u1", {
      nowMs: 100000,
      randomInt: (max) => {
        calls.push(max);
        return 0;
      },
    });
    expect(s.sectorIds).not.toContain("empty");
    expect(calls).toEqual([5, 2]);
  });
  it("таймаут неверного ответа даёт ноль и минус одну жизнь", () => {
    const s = atDeadline(
      until(start(2, { ...defaultSettings, mode: "elimination" }), "question"),
    );
    expect(s.phase).toBe("reveal");
    expect(s.players.map((p) => p.lives)).toEqual([1, 1]);
  });
});

describe("Границы начисления и наблюдение", () => {
  for (const mode of ["points", "speed"] as const)
    it(`все уровни и итоговая формула ${mode}`, () => {
      let s = start(2, { ...defaultSettings, mode });
      for (let i = 0; i < 10; i++) {
        s = until(s, "question");
        const now = s.phaseStartedAt,
          q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
        s = apply(
          s,
          { type: "answer", text: q.acceptedAnswers[0]! },
          "u1",
          context(now),
        );
        s = apply(s, { type: "answer", text: "ошибка" }, "u2", context(now));
        s = until(s, i === 9 ? "finished" : "spin");
      }
      expect(result(s)?.scores.find((p) => p.userId === "u1")?.score).toBe(
        mode === "speed" ? 2600 : 2100,
      );
      expect(result(s)?.winnerUserIds).toEqual(["u1"]);
    });
  it("выбывший наблюдает текущий вопрос без возможности ответить", () => {
    let s = start(3, { ...defaultSettings, mode: "elimination" });
    for (let i = 0; i < 2; i++) {
      s = until(s, "question");
      const now = s.phaseStartedAt,
        q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
      for (const id of ["u1", "u2", "u3"])
        s = apply(
          s,
          {
            type: "answer",
            text: id === "u3" ? "ошибка" : q.acceptedAnswers[0]!,
          },
          id,
          context(now),
        );
      s = until(s, "spin");
    }
    s = until(s, "question");
    expect(s.players[2]!.lives).toBe(0);
    expect(project(s, "u3").question).not.toBeNull();
    expect(() =>
      apply(s, { type: "answer", text: "а" }, "u3", context(s.phaseStartedAt)),
    ).toThrow();
  });
  it("повтор разрешён только после исчерпания пула уровня", () => {
    let s = lobby();
    s.contentSnapshot.questions = [1, 2, 3].flatMap((level) =>
      content.questions.filter((q) => q.difficulty === level).slice(0, 3),
    );
    s.players.forEach((p) => (p.ready = true));
    s = apply(s, { type: "start" }, "u1", context());
    const ids: string[] = [];
    for (let i = 1; i <= 10; i++) {
      s = until(s, "question");
      if (i >= 7) ids.push(s.currentId!);
      s = until(s, i === 10 ? "finished" : "spin");
    }
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBe(ids[0]);
  });
});
