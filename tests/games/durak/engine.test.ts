import { describe, it, expect } from "vitest";
import {
  create,
  advance,
  apply,
  project,
  result,
  nextDeadline,
  beats,
  cardKey,
  cancel,
} from "../../../server/games/durak/engine";
import {
  StateSchema,
  ViewSchema,
  ActionSchema,
  ContentSchema,
} from "../../../shared/games/durak/types";
import type {
  State,
  Card,
  Action,
  Context,
} from "../../../shared/games/durak/types";
import { demoContent } from "./fixtures";
const rng = (seed: number) => {
  let n = seed >>> 0;
  return (max: number) => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n % max;
  };
};
const setup = (n = 2, educational = false, seed = 42) =>
  create({
    sessionId: "test-session",
    hostId: "p0",
    participants: Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      username: `Игрок ${i}`,
    })),
    settings: { maxPlayers: 6, educational, ruleIds: [] },
    contentSnapshot: demoContent,
    ctx: { nowMs: 0, randomInt: rng(seed) },
  });
const begun = (n = 2, edu = false) =>
  advance(setup(n, edu), { nowMs: 500, randomInt: rng(1) });
const allCards = (s: State) => [
  ...s.deck,
  ...s.discard,
  ...s.players.flatMap((p) => p.hand),
  ...s.table.flatMap((p) => (p.defense ? [p.attack, p.defense] : [p.attack])),
];
function conserved(s: State) {
  const cards = allCards(s).map(cardKey);
  expect(cards).toHaveLength(36);
  expect(new Set(cards).size).toBe(36);
  expect(StateSchema.safeParse(JSON.parse(JSON.stringify(s))).success).toBe(
    true,
  );
}
const ctx: Context = { nowMs: 501, randomInt: rng(9) };
const c = (suit: Card["suit"], rank: number): Card => ({ suit, rank });
function configured(hands: Card[][], deck: Card[] = [], discardRest = true) {
  let s = begun(hands.length);
  const used = [...hands.flat(), ...deck].map(cardKey);
  const rest = allCards(s).filter((c) => !used.includes(cardKey(c)));
  s.players.forEach((p, i) => {
    p.hand = hands[i];
    p.out = false;
  });
  s.deck = discardRest ? deck : [...deck, ...rest];
  s.discard = discardRest ? rest : [];
  s.table = [];
  s.attacker = 0;
  s.lastThrower = 0;
  s.defender = 1;
  s.turn = 0;
  s.round = 1;
  s.limit = Math.min(6, hands[1].length);
  s.phase = "attack";
  s.trump = c("spades", 6);
  return s;
}
function step(s: State, a: Action) {
  return apply(s, a, s.players[s.turn].id, ctx);
}
describe("Движок: правила", () => {
  it("при отсутствии козырей первый атакующий выбирается серверной случайностью", () => {
    const s = create({
      sessionId: "no-trumps",
      hostId: "p0",
      participants: [
        { id: "p0", username: "А" },
        { id: "p1", username: "Б" },
      ],
      settings: { maxPlayers: 2, educational: false, ruleIds: [] },
      contentSnapshot: [],
      ctx: { nowMs: 0, randomInt: (n) => n - 1 },
    });
    expect(
      s.players.every((p) => p.hand.every((c) => c.suit !== s.trump.suit)),
    ).toBe(true);
    expect(s.attacker).toBe(1);
  });
  it("выбывший читает только свой пустой View и не может ходить", () => {
    let s = configured([
      [c("hearts", 6)],
      [c("hearts", 7), c("clubs", 8)],
      [c("clubs", 9), c("diamonds", 10)],
    ]);
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    s = step(s, { type: "pass" });
    s = step(s, { type: "pass" });
    const v = project(s, "p0");
    expect(v.hand).toEqual([]);
    expect(v.legalCards).toEqual([]);
    expect(v.canBonus).toBe(false);
    expect(() => apply(s, { type: "pass" }, "p0", ctx)).toThrow();
  });
  it("бонус выключен в настройках; карта запрещена до ответа; входные секреты отклоняются", () => {
    expect(() => step(begun(), { type: "bonus" })).toThrow();
    const s = step(begun(2, true), { type: "bonus" });
    expect(() =>
      step(s, { type: "attack", card: s.players[s.turn].hand[0] }),
    ).toThrow();
    expect(
      StateSchema.safeParse({ ...s, deck: [...s.deck, s.deck[0]] }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({ type: "pass", userId: "другой", score: 150 })
        .success,
    ).toBe(false);
  });

  it("раздаёт все 36 карт, младший козырь атакует, открытая последняя", () => {
    for (const n of [2, 6]) {
      const s = setup(n);
      conserved(s);
      expect(s.players.every((p) => p.hand.length === 6)).toBe(true);
      if (s.deck.length) expect(s.deck.at(-1)).toEqual(s.trump);
      const trumps = s.players
        .flatMap((p, i) =>
          p.hand
            .filter((c) => c.suit === s.trump.suit)
            .map((c) => ({ rank: c.rank, i })),
        )
        .sort((a, b) => a.rank - b.rank);
      if (trumps.length) expect(s.attacker).toBe(trumps[0].i);
    }
  });
  it("не допускает пустой состав и неверное число игроков", () => {
    expect(() => setup(0)).toThrow();
    expect(() => setup(1)).toThrow();
    expect(() => setup(7)).toThrow();
  });
  it("проверяет козырь против козыря и масть", () => {
    expect(beats(c("spades", 7), c("spades", 6), "spades")).toBe(true);
    expect(beats(c("spades", 6), c("spades", 7), "spades")).toBe(false);
    expect(beats(c("spades", 6), c("hearts", 14), "spades")).toBe(true);
    expect(beats(c("hearts", 14), c("spades", 6), "spades")).toBe(false);
    expect(beats(c("clubs", 14), c("hearts", 6), "spades")).toBe(false);
  });
  it("первая атака одной картой, очередь чужого хода запрещена", () => {
    const s = begun();
    expect(() =>
      apply(s, { type: "pass" }, s.players[s.turn].id, ctx),
    ).toThrow();
    expect(() =>
      apply(
        s,
        { type: "attack", card: s.players[s.turn].hand[0] },
        s.players[s.defender].id,
        ctx,
      ),
    ).toThrow();
    const t = step(s, { type: "attack", card: s.players[s.turn].hand[0] });
    expect(t.phase).toBe("defend");
    expect(t.table).toHaveLength(1);
    conserved(t);
  });
  it("ранги покрывающих карт допускаются для подкидывания; иные запрещены", () => {
    let s = configured([
      [c("hearts", 6), c("clubs", 7), c("clubs", 9)],
      [c("hearts", 7), c("spades", 8), c("diamonds", 10)],
    ]);
    s = step(s, { type: "attack", card: c("hearts", 6) });
    expect(() =>
      step(s, { type: "defend", card: c("diamonds", 10), pair: 0 }),
    ).toThrow();
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    expect(project(s, "p0").legalCards).toContainEqual(c("clubs", 7));
    expect(() => step(s, { type: "attack", card: c("clubs", 9) })).toThrow();
  });
  it("подкидывание по часовой стрелке с ответом защитника", () => {
    let s = configured([
      [c("hearts", 6), c("clubs", 6)],
      [c("hearts", 7), c("spades", 8)],
      [c("diamonds", 7), c("clubs", 10)],
    ]);
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    expect(s.turn).toBe(2);
    s = step(s, { type: "attack", card: c("diamonds", 7) });
    expect(s.turn).toBe(1);
    expect(s.table.length).toBe(2);
  });
  it("малая рука ограничивает заход одной атакой, после отбоя ничья двух последних", () => {
    let s = configured([[c("hearts", 6)], [c("hearts", 7)]]);
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    expect(s.final?.outcome).toBe("draw");
    expect(s.final?.scores.map((p) => p.score)).toEqual([50, 50]);
    conserved(s);
  });
  it("после Беру только один круг подкидывания и защитник получает стол", () => {
    let s = configured([
      [c("hearts", 6), c("clubs", 6)],
      [c("diamonds", 7), c("diamonds", 8), c("diamonds", 9)],
      [c("diamonds", 6), c("clubs", 10)],
    ]);
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "take" });
    expect(s.turn).toBe(0);
    s = step(s, { type: "attack", card: c("clubs", 6) });
    expect(s.turn).toBe(2);
    s = step(s, { type: "pass" });
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.table).toHaveLength(0);
    expect(s.attacker).toBe(2);
    expect(s.players[0].out).toBe(true);
    conserved(s);
  });
  it("первый атакующий выходит без потери указателя", () => {
    let s = configured([
      [c("hearts", 6)],
      [c("hearts", 7), c("clubs", 8)],
      [c("clubs", 9), c("diamonds", 10)],
    ]);
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    s = step(s, { type: "pass" });
    s = step(s, { type: "pass" });
    expect(s.players[0].out).toBe(true);
    expect(s.attacker).toBe(1);
    expect(s.defender).toBe(2);
    conserved(s);
  });
  it("добор: атакующий первым, открытый козырь последним", () => {
    let s = configured(
      [
        [c("hearts", 6), c("clubs", 9)],
        [c("hearts", 7), c("clubs", 10)],
      ],
      [c("diamonds", 8), c("spades", 6)],
    );
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    s = step(s, { type: "pass" });
    expect(s.players[0].hand).toContainEqual(c("spades", 6));
    expect(s.deck).toHaveLength(0);
    conserved(s);
  });
  it("добирает защитнику последним", () => {
    let s = configured(
      [
        [c("hearts", 6), c("clubs", 9)],
        [c("hearts", 7), c("clubs", 10)],
        [c("diamonds", 9), c("diamonds", 10)],
      ],
      [],
      false,
    );
    const expected = [...s.deck];
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    s = step(s, { type: "pass" });
    s = step(s, { type: "pass" });
    expect(s.players[0].hand.slice(1)).toEqual(expected.slice(0, 5));
    expect(s.players[2].hand.slice(2)).toEqual(expected.slice(5, 9));
    expect(s.players[1].hand.slice(1)).toEqual(expected.slice(9, 14));
    conserved(s);
  });
  it("предел 150 заходов приводит к ничьей оставшихся", () => {
    let s = configured([
      [c("hearts", 6), c("clubs", 9)],
      [c("hearts", 7), c("clubs", 10)],
    ]);
    s.round = 150;
    s = step(s, { type: "attack", card: c("hearts", 6) });
    s = step(s, { type: "defend", card: c("hearts", 7), pair: 0 });
    s = step(s, { type: "pass" });
    expect(s.final?.outcome).toBe("draw");
  });
  it("пустой пул допустим без бонусов, с бонусами запуск запрещён", () => {
    expect(() =>
      create({
        ...{
          sessionId: "x",
          hostId: "p0",
          participants: [
            { id: "p0", username: "A" },
            { id: "p1", username: "B" },
          ],
          settings: { maxPlayers: 2, educational: true, ruleIds: [] },
          contentSnapshot: [],
          ctx,
        },
      }),
    ).toThrow("Нет опубликованных");
    expect(begun().contentSnapshot.length).toBeGreaterThan(0);
  });
  it("не мутирует вход, сериализуется, View не содержит колоды, чужих рук и ответов", () => {
    const s = begun(),
      snapshot = JSON.stringify(s);
    const t = step(s, { type: "attack", card: s.players[s.turn].hand[0] });
    expect(JSON.stringify(s)).toBe(snapshot);
    advance(s, { ...ctx, nowMs: 90000 });
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(ViewSchema.safeParse(project(t, "p0")).success).toBe(true);
    const v = JSON.stringify(project(t, "p0"));
    for (const secret of [
      "acceptedAnswers",
      "contentSnapshot",
      '"deck":',
      '"discard":',
      "lastThrower",
    ])
      expect(v).not.toContain(secret);
    expect(project(t, "p0").players.every((p) => !("hand" in p))).toBe(true);
    expect(() => project(t, "outsider")).toThrow();
  });
  it("runtime-валидаторы отбрасывают лишние поля и неверные ответы", () => {
    expect(ActionSchema.safeParse({ type: "pass", win: true }).success).toBe(
      false,
    );
    expect(
      ContentSchema.safeParse({ ...demoContent[0], acceptedAnswers: [55] })
        .success,
    ).toBe(false);
  });
});
describe("Таймеры и бонус", () => {
  it("точно на deadline ход просрочен; первая атака автоматическая", () => {
    const s = begun();
    expect(() =>
      apply(
        s,
        { type: "attack", card: s.players[s.turn].hand[0] },
        s.players[s.turn].id,
        { ...ctx, nowMs: s.deadline! },
      ),
    ).toThrow("истекло");
    const t = advance(s, { ...ctx, nowMs: s.deadline! });
    expect(t.phase).toBe("defend");
    expect(t.deadline).toBe(s.deadline! + 25000);
  });
  it("таймаут защиты Беру, подкидывания пас, дедлайн от предыдущего", () => {
    let s = begun();
    s = step(s, { type: "attack", card: s.players[s.turn].hand[0] });
    const deadline = s.deadline!;
    s = advance(s, { ...ctx, nowMs: deadline });
    expect(s.taking).toBe(true);
    expect(s.phase).toBe("attack");
    s = advance(s, { ...ctx, nowMs: deadline + 25000 });
    expect(s.table).toHaveLength(0);
    expect(s.deadline).toBe(deadline + 50000);
  });
  it("верный бонус +10 секунд, повтор за заход запрещён", () => {
    let s = begun(2, true);
    const actor = s.players[s.turn].id;
    const initial = s.deadline!;
    s = apply(s, { type: "bonus" }, actor, ctx);
    const c = s.contentSnapshot.find((c) => c.id === s.bonus!.contentId)!;
    const v = JSON.stringify(project(s, actor));
    expect(v).not.toContain("acceptedAnswers");
    expect(v).not.toContain(c.explanation);
    s = apply(s, { type: "answer", answers: c.acceptedAnswers }, actor, {
      ...ctx,
      nowMs: 1500,
    });
    expect(s.deadline).toBe(1500 + (initial - 501) + 10000);
    expect(s.players[s.turn].stats.correct).toBe(1);
    expect(() =>
      apply(s, { type: "bonus" }, actor, { ...ctx, nowMs: 1501 }),
    ).toThrow();
  });
  it("неверный бонус без прибавки; таймаут задания не продлевает паузу", () => {
    let s = begun(2, true);
    const actor = s.players[s.turn].id;
    s = apply(s, { type: "bonus" }, actor, ctx);
    const c = s.contentSnapshot.find((c) => c.id === s.bonus!.contentId)!;
    s = apply(s, { type: "answer", answers: [c.options.length - 1] }, actor, {
      ...ctx,
      nowMs: 1000,
    });
    expect(s.players[s.turn].stats.wrong).toBe(1);
    let t = begun(2, true);
    const initial = t.deadline!;
    t = step(t, { type: "bonus" });
    const deadline = t.bonus!.deadline;
    t = advance(t, { ...ctx, nowMs: deadline });
    expect(t.bonus).toBeNull();
    expect(t.deadline).toBe(initial + 15000);
    expect(t.players[t.turn].stats.timedOut).toBe(1);
  });
  it("перезапуск сохраняет точные дедлайны, крупный скачок конечен", () => {
    const s = begun();
    const a = advance(s, { ...ctx, nowMs: 100000000 });
    const b = advance(JSON.parse(JSON.stringify(s)) as State, {
      ...ctx,
      randomInt: rng(9),
      nowMs: 100000000,
    });
    expect(a).toEqual(b);
    expect(a.phase).toBe("finished");
    expect(nextDeadline(a)).toBeNull();
    conserved(a);
  });
  it("отмена без победителей, последующие действия запрещены", () => {
    const s = cancel(begun());
    expect(result(s)).toMatchObject({
      outcome: "cancelled",
      winnerUserIds: [],
      scores: [],
    });
    expect(() => step(s, { type: "pass" })).toThrow();
  });
});
describe("Полные партии", () => {
  for (const n of [2, 3, 4, 5, 6])
    it(`${n} игроков: реальная последовательность разрешённых ходов до результата`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        let s = advance(setup(n, false, seed), {
          nowMs: 500,
          randomInt: rng(seed),
        });
        let clock = 501;
        for (let steps = 0; steps < 5000 && !result(s); steps++) {
          const v = project(s, s.players[s.turn].id);
          let action: Action;
          if (v.phase === "defend") {
            const pair = s.table.findIndex((p) => !p.defense);
            const card = v.hand.find((c) =>
              beats(c, s.table[pair].attack, s.trump.suit),
            );
            action = card ? { type: "defend", card, pair } : { type: "take" };
          } else
            action = v.legalCards.length
              ? { type: "attack", card: v.legalCards[0] }
              : { type: "pass" };
          const before = JSON.stringify(s);
          const nextState = apply(s, action, v.turnId, {
            nowMs: clock++,
            randomInt: rng(seed),
          });
          expect(JSON.stringify(s)).toBe(before);
          s = nextState;
          conserved(s);
        }
        expect(result(s)).not.toBeNull();
        expect(result(s)?.scores).toHaveLength(n);
        expect(result(s)).toEqual(result(s));
      }
    });
});
