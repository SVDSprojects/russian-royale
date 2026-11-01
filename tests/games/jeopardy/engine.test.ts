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
} from "../../../server/games/jeopardy/engine";
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
} from "../../../shared/games/jeopardy/types";
import raw from "../../../server/games/jeopardy/initial-content.json" with { type: "json" };
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
    expect(result(end)?.outcome).toBe("cancelled");
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

function reading(): State {
  const s = start(),
    team = s.teams.find((t) => t.id === s.chooserTeamId)!;
  return apply(
    s,
    { type: "select", questionId: "glasnye_1" },
    team.captainId,
    context(),
  );
}
function buzz(): State {
  return atDeadline(reading());
}
describe("Команды, табло и сигнал", () => {
  it("полный набор ровно 5×5; публикация блокирует пропуски и повтор стоимости", () => {
    expect(contentIssues(content)).toEqual([]);
    const bad = structuredClone(content);
    bad.questions[1]!.cost = 100;
    expect(contentIssues(bad).length).toBeGreaterThan(0);
    bad.questions.pop();
    expect(contentIssues(bad).length).toBeGreaterThan(0);
  });
  it("2–4 команды; игроки выбирают команду и капитана только в лобби", () => {
    let s = lobby(4, { ...defaultSettings, teamCount: 4 });
    expect(s.teams).toHaveLength(4);
    s = apply(s, { type: "team", teamId: "t1" }, "u2", context());
    s = apply(s, { type: "captain", userId: "u2" }, "u1", context());
    expect(s.teams.find((t) => t.id === "t1")!.captainId).toBe("u2");
    expect(() =>
      apply(s, { type: "captain", userId: "u3" }, "u1", context()),
    ).toThrow();
    expect(() =>
      apply(start(), { type: "team", teamId: "t2" }, "u1", context()),
    ).toThrow();
  });
  it("только капитан выбирает доступную ячейку", () => {
    const s = start(4);
    expect(() =>
      apply(s, { type: "select", questionId: "glasnye_1" }, "u3", context()),
    ).toThrow();
    expect(() =>
      apply(s, { type: "select", questionId: "missing" }, "u1", context()),
    ).toThrow();
  });
  it("таймаут выбора: минимум стоимости, слева направо", () => {
    const s = atDeadline(start());
    expect(s.currentId).toBe("glasnye_1");
    expect(s.deadline).toBe(125000);
  });
  it("ранний сигнал запрещён; два одновременных сигнала обслуживаются последовательно", () => {
    expect(() =>
      apply(reading(), { type: "buzz" }, "u1", context(104999)),
    ).toThrow();
    let s = buzz();
    s = apply(s, { type: "buzz" }, "u1", context(105000));
    expect(s.answererId).toBe("u1");
    expect(() => apply(s, { type: "buzz" }, "u2", context(105000))).toThrow();
  });
  it("сигнал на границе дедлайна отклоняется", () => {
    const s = buzz();
    expect(() =>
      apply(s, { type: "buzz" }, "u1", context(s.deadline!)),
    ).toThrow();
  });
  it("ошибка даёт отрицательный счёт и блокирует всю команду", () => {
    let s = apply(buzz(), { type: "buzz" }, "u1", context(105000));
    s = apply(s, { type: "answer", text: "неверно" }, "u1", context(105001));
    expect(s.teams[0]!.score).toBe(-100);
    expect(s.phase).toBe("buzz");
    expect(s.deadline).toBe(115001);
    expect(() => apply(s, { type: "buzz" }, "u1", context(105002))).toThrow();
    s = apply(s, { type: "buzz" }, "u2", context(105003));
    s = apply(s, { type: "answer", text: "и" }, "u2", context(105004));
    expect(s.phase).toBe("reveal");
    expect(s.chooserTeamId).toBe("t2");
    expect(s.teams[1]!.score).toBe(100);
  });
  it("ответить может только нажавший, не капитан вместо него", () => {
    let s = start(4);
    s = atDeadline(atDeadline(s));
    s = apply(s, { type: "buzz" }, "u3", context(s.phaseStartedAt));
    expect(() =>
      apply(
        s,
        { type: "answer", text: "и" },
        "u1",
        context(s.phaseStartedAt + 1),
      ),
    ).toThrow();
  });
  it("таймаут ответа штрафует; все ошибки сохраняют прежний выбор", () => {
    let s = apply(buzz(), { type: "buzz" }, "u1", context(105000));
    s = atDeadline(s);
    expect(s.teams[0]!.score).toBe(-100);
    s = apply(s, { type: "buzz" }, "u2", context(s.phaseStartedAt));
    s = atDeadline(s);
    expect(s.phase).toBe("reveal");
    expect(s.chooserTeamId).toBe("t1");
    expect(s.teams[1]!.score).toBe(-100);
  });
  it("закрытая ячейка не переигрывается; reveal длится 6 секунд", () => {
    let s = atDeadline(buzz());
    expect(s.phase).toBe("reveal");
    expect(s.deadline! - s.phaseStartedAt).toBe(6000);
    s = atDeadline(s);
    expect(s.phase).toBe("board");
    expect(() =>
      apply(
        s,
        { type: "select", questionId: "glasnye_1" },
        "u1",
        context(s.phaseStartedAt),
      ),
    ).toThrow();
  });
  it("капитан заменяется первым подключённым через 45 секунд", () => {
    const s = start(4);
    s.players[0]!.online = false;
    s.players[0]!.offlineSince = 100000;
    expect(advance(s, context(144999)).teams[0]!.captainId).toBe("u1");
    expect(advance(s, context(145000)).teams[0]!.captainId).toBe("u3");
  });
  it("закрытый чат видят только участники команды; HTML остаётся текстом", () => {
    let s = start(4);
    s = apply(
      s,
      { type: "chat", text: "СЕКРЕТ_123 <script>alert(1)</script>" },
      "u1",
      context(),
    );
    expect(project(s, "u3").chat).toHaveLength(1);
    expect(JSON.stringify(project(s, "u2"))).not.toContain("СЕКРЕТ_123");
    expect(project(s, "u1").chat[0]!.text).toContain("<script>");
  });
  it("ответы и объяснения скрыты до reveal даже от отвечавшего", () => {
    let s = apply(buzz(), { type: "buzz" }, "u1", context(105000));
    for (const id of ["u1", "u2"]) {
      const json = JSON.stringify(project(s, id));
      expect(json).not.toContain("acceptedAnswers");
      expect(json).not.toContain(content.questions[0]!.explanation);
    }
    s = apply(s, { type: "answer", text: "неверно" }, "u1", context(105001));
    expect(project(s, "u1").reveal).toBeNull();
    expect(project(s, "u2").reveal).toBeNull();
  });
  it("полная победа команды включает всех её участников, исход win", () => {
    let s = start(4);
    s = apply(s, { type: "select", questionId: "glasnye_1" }, "u1", context());
    s = atDeadline(s);
    s = apply(s, { type: "buzz" }, "u3", context(s.phaseStartedAt));
    s = apply(
      s,
      { type: "answer", text: "и" },
      "u3",
      context(s.phaseStartedAt + 1),
    );
    s = advance(s, context(10000000));
    expect(result(s)?.winnerUserIds).toEqual(["u1", "u3"]);
    expect(result(s)?.outcome).toBe("win");
    expect(s.used).toHaveLength(25);
  });
});

it("после ошибки блокируется и другой участник той же команды", () => {
  let s = start(4);
  s = atDeadline(atDeadline(s));
  s = apply(s, { type: "buzz" }, "u1", context(s.phaseStartedAt));
  s = apply(
    s,
    { type: "answer", text: "ошибка" },
    "u1",
    context(s.phaseStartedAt + 1),
  );
  expect(() =>
    apply(s, { type: "buzz" }, "u3", context(s.phaseStartedAt + 1)),
  ).toThrow();
});
