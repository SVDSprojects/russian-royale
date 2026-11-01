import {
  ActionSchema,
  ContentSchema,
  SettingsSchema,
  StateSchema,
  ParticipantSchema,
  GameError,
  EmptyParticipantsError,
  MatchCancelledError,
} from "../../../shared/games/durak/types";
import type {
  State,
  Card,
  Context,
  CreateInput,
  Action,
  Result,
  View,
} from "../../../shared/games/durak/types";
const ACTION_MS = 25000;
export const cardKey = (c: Card) => `${c.suit}:${c.rank}`;
export const beats = (a: Card, b: Card, trump: Card["suit"]) =>
  a.suit === b.suit ? a.rank > b.rank : a.suit === trump && b.suit !== trump;
const clone = (s: State): State => JSON.parse(JSON.stringify(s)) as State;
const active = (s: State) =>
  s.players.map((_, i) => i).filter((i) => !s.players[i].out);
const next = (s: State, i: number, except = -1) => {
  for (let n = 1; n <= s.players.length; n++) {
    const j = (i + n) % s.players.length;
    if (!s.players[j].out && j !== except) return j;
  }
  throw new EmptyParticipantsError();
};
function random(ctx: Context, n: number) {
  const v = ctx.randomInt(n);
  if (!Number.isInteger(v) || v < 0 || v >= n)
    throw new GameError(500, "Ошибка генератора случайности");
  return v;
}
function startRound(s: State, attacker: number, now: number) {
  s.phase = "attack";
  s.attacker = attacker;
  s.defender = next(s, attacker);
  s.turn = attacker;
  s.round++;
  s.table = [];
  s.limit = Math.min(6, s.players[s.defender].hand.length);
  s.passes = 0;
  s.lastThrower = attacker;
  s.taking = false;
  s.throwRemaining = 0;
  s.deadline = now + ACTION_MS;
  s.bonus = null;
  s.feedback = null;
  for (const p of s.players) p.bonusUsed = false;
}
function finish(s: State, draw: boolean) {
  s.phase = "finished";
  s.deadline = null;
  s.bonus = null;
  const remaining = active(s);
  s.final = {
    sessionId: s.sessionId,
    winnerUserIds: s.players.filter((p) => p.out).map((p) => p.id),
    scores: s.players.map((p, i) => ({
      userId: p.id,
      score: p.out ? 100 : draw ? 50 : 30,
    })),
    outcome: draw ? "draw" : "win",
  };
  if (!draw && remaining.length === 0) s.final.outcome = "draw";
}
function resolve(s: State, now: number) {
  s.phase = "refill";
  if (s.taking) {
    for (const p of s.table) {
      s.players[s.defender].hand.push(p.attack);
      if (p.defense) s.players[s.defender].hand.push(p.defense);
    }
  } else {
    for (const p of s.table) {
      s.discard.push(p.attack);
      if (p.defense) s.discard.push(p.defense);
    }
  }
  s.table = [];
  const order = [s.attacker];
  for (let n = 1; n < s.players.length; n++) {
    const i = (s.attacker + n) % s.players.length;
    if (i !== s.defender) order.push(i);
  }
  order.push(s.defender);
  for (const i of order) {
    const p = s.players[i];
    if (!p.out)
      while (p.hand.length < 6 && s.deck.length) p.hand.push(s.deck.shift()!);
  }
  const oldActive = active(s);
  if (!s.deck.length) {
    const empty = oldActive.filter((i) => s.players[i].hand.length === 0);
    if (empty.length === oldActive.length) {
      finish(s, true);
      return;
    }
    for (const i of empty) s.players[i].out = true;
    if (active(s).length <= 1) {
      finish(s, false);
      return;
    }
  }
  if (s.round >= 150) {
    finish(s, true);
    return;
  }
  const a = s.taking
    ? next(s, s.defender)
    : s.players[s.defender].out
      ? next(s, s.defender)
      : s.defender;
  startRound(s, a, now);
}
function offer(s: State, from: number, now: number) {
  if (s.table.length >= s.limit) {
    resolve(s, now);
    return;
  }
  s.phase = "attack";
  s.turn = next(s, from, s.defender);
  s.deadline = now + ACTION_MS;
}
export function create(input: CreateInput): State {
  if (!input.participants.length) throw new EmptyParticipantsError();
  const settings = SettingsSchema.parse(input.settings);
  const participants = input.participants.map((p) =>
    ParticipantSchema.parse(p),
  );
  if (
    participants.length < 2 ||
    participants.length > settings.maxPlayers ||
    new Set(participants.map((p) => p.id)).size !== participants.length ||
    !participants.some((p) => p.id === input.hostId)
  )
    throw new GameError(422, "Неверный состав игроков");
  const content = input.contentSnapshot
    .map((c) => ContentSchema.parse(c))
    .filter(
      (c) =>
        c.status === "published" &&
        (!settings.ruleIds.length || settings.ruleIds.includes(c.ruleId)),
    );
  if (settings.educational && !content.length)
    throw new GameError(422, "Нет опубликованных учебных заданий");
  const deck: Card[] = [];
  for (const suit of ["clubs", "diamonds", "hearts", "spades"] as const)
    for (let rank = 6; rank <= 14; rank++) deck.push({ suit, rank });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = random(input.ctx, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const trump = { ...deck[deck.length - 1] };
  const players = participants.map((p) => ({
    ...p,
    hand: [] as Card[],
    out: false,
    bonusUsed: false,
    stats: { asked: 0, correct: 0, wrong: 0, timedOut: 0 },
  }));
  for (let n = 0; n < 6; n++)
    for (const p of players) p.hand.push(deck.shift()!);
  let attacker = -1,
    min = 15;
  players.forEach((p, i) =>
    p.hand.forEach((c) => {
      if (c.suit === trump.suit && c.rank < min) {
        min = c.rank;
        attacker = i;
      }
    }),
  );
  if (attacker < 0) attacker = random(input.ctx, players.length);
  const s: State = {
    sessionId: input.sessionId,
    hostId: input.hostId,
    settings,
    contentSnapshot: content,
    players,
    phase: "dealing",
    deck,
    discard: [],
    trump,
    table: [],
    attacker,
    defender: next({ players } as State, attacker),
    turn: attacker,
    round: 0,
    limit: 0,
    lastThrower: attacker,
    passes: 0,
    taking: false,
    throwRemaining: 0,
    deadline: input.ctx.nowMs + 500,
    bonus: null,
    feedback: null,
    final: null,
  };
  return StateSchema.parse(s);
}
function remove(s: State, i: number, card: Card) {
  const hand = s.players[i].hand;
  const at = hand.findIndex((c) => cardKey(c) === cardKey(card));
  if (at < 0) throw new GameError(422, "Такой карты нет в вашей руке");
  hand.splice(at, 1);
}
export function legalCards(s: State, i: number): Card[] {
  if (
    s.phase === "finished" ||
    s.phase === "dealing" ||
    s.bonus ||
    s.turn !== i ||
    s.players[i].out
  )
    return [];
  if (s.phase === "defend")
    return s.players[i].hand.filter((c) =>
      s.table.some((p) => !p.defense && beats(c, p.attack, s.trump.suit)),
    );
  if (s.phase !== "attack" || s.table.length >= s.limit) return [];
  if (!s.table.length) return [...s.players[i].hand];
  const ranks = s.table.flatMap((p) =>
    p.defense ? [p.attack.rank, p.defense.rank] : [p.attack.rank],
  );
  return s.players[i].hand.filter((c) => ranks.includes(c.rank));
}
function perform(
  s: State,
  action: Action,
  actorId: string,
  ctx: Context,
): State {
  if (s.final?.outcome === "cancelled") throw new MatchCancelledError();
  const i = s.players.findIndex((p) => p.id === actorId);
  if (
    i < 0 ||
    i !== s.turn ||
    s.players[i].out ||
    !["attack", "defend"].includes(s.phase)
  )
    throw new GameError(422, "Сейчас действует другой игрок");
  const p = s.players[i];
  if (action.type === "answer") {
    if (!s.bonus || s.bonus.userId !== actorId)
      throw new GameError(422, "Нет активного задания");
    const c = s.contentSnapshot.find((c) => c.id === s.bonus!.contentId)!;
    const answers = [...new Set(action.answers)].sort((a, b) => a - b);
    const correct =
      JSON.stringify(answers) ===
      JSON.stringify([...c.acceptedAnswers].sort((a, b) => a - b));
    p.stats[correct ? "correct" : "wrong"]++;
    s.deadline = ctx.nowMs + s.bonus.remainingMs + (correct ? 10000 : 0);
    s.feedback = { userId: actorId, correct, explanation: c.explanation };
    s.bonus = null;
    return s;
  }
  if (s.bonus) throw new GameError(422, "Сначала завершите задание");
  if (action.type === "bonus") {
    if (!s.settings.educational || p.bonusUsed || !s.contentSnapshot.length)
      throw new GameError(422, "Бонус недоступен");
    p.bonusUsed = true;
    p.stats.asked++;
    const task = s.contentSnapshot[random(ctx, s.contentSnapshot.length)];
    s.bonus = {
      userId: actorId,
      contentId: task.id,
      deadline: ctx.nowMs + 15000,
      remainingMs: Math.min(ACTION_MS, Math.max(0, s.deadline! - ctx.nowMs)),
    };
    return s;
  }
  s.feedback = null;
  if (action.type === "attack") {
    if (
      s.phase !== "attack" ||
      !legalCards(s, i).some((c) => cardKey(c) === cardKey(action.card))
    )
      throw new GameError(422, "Эту карту нельзя подкинуть");
    remove(s, i, action.card);
    s.table.push({ attack: action.card, defense: null });
    s.lastThrower = i;
    s.passes = 0;
    if (s.taking) {
      s.throwRemaining--;
      if (s.throwRemaining <= 0 || s.table.length >= s.limit)
        resolve(s, ctx.nowMs);
      else offer(s, i, ctx.nowMs);
    } else {
      s.phase = "defend";
      s.turn = s.defender;
      s.deadline = ctx.nowMs + ACTION_MS;
    }
    return s;
  }
  if (action.type === "defend") {
    const pair = s.table[action.pair];
    if (
      s.phase !== "defend" ||
      !pair ||
      pair.defense ||
      !beats(action.card, pair.attack, s.trump.suit)
    )
      throw new GameError(422, "Этой картой нельзя покрыть выбранную карту");
    remove(s, i, action.card);
    pair.defense = action.card;
    if (s.table.some((p) => !p.defense)) {
      s.deadline = ctx.nowMs + ACTION_MS;
    } else {
      offer(s, findLastAttacker(s), ctx.nowMs);
    }
    return s;
  }
  if (action.type === "take") {
    if (s.phase !== "defend")
      throw new GameError(422, "Взять карты можно только при защите");
    s.taking = true;
    s.throwRemaining = active(s).length - 1;
    s.passes = 0;
    if (s.table.length >= s.limit) resolve(s, ctx.nowMs);
    else {
      s.phase = "attack";
      s.turn = s.attacker;
      s.deadline = ctx.nowMs + ACTION_MS;
    }
    return s;
  }
  if (action.type === "pass") {
    if (s.phase !== "attack" || !s.table.length)
      throw new GameError(422, "Первую атаку нельзя пропустить");
    s.passes++;
    if (s.taking) s.throwRemaining--;
    if (s.taking ? s.throwRemaining <= 0 : s.passes >= active(s).length - 1)
      resolve(s, ctx.nowMs);
    else offer(s, i, ctx.nowMs);
    return s;
  }
  throw new GameError(422, "Недопустимое действие");
}
function findLastAttacker(s: State) {
  return s.lastThrower;
}
export function apply(
  state: State,
  action: Action,
  actorId: string,
  ctx: Context,
): State {
  ActionSchema.parse(action);
  if (nextDeadline(state) !== null && ctx.nowMs >= nextDeadline(state)!)
    throw new GameError(422, "Время действия истекло");
  return perform(clone(state), action, actorId, ctx);
}
export function advance(state: State, ctx: Context): State {
  const s = clone(state);
  for (let steps = 0; steps < 2000; steps++) {
    const d = nextDeadline(s);
    if (d === null || d > ctx.nowMs) return s;
    const clock = { ...ctx, nowMs: d };
    if (s.bonus) {
      const p = s.players.find((p) => p.id === s.bonus!.userId)!;
      p.stats.timedOut++;
      s.deadline = d + s.bonus.remainingMs;
      s.feedback = {
        userId: p.id,
        correct: false,
        explanation: "Время задания истекло.",
      };
      s.bonus = null;
      continue;
    }
    if (s.phase === "dealing") {
      startRound(s, s.attacker, d);
      continue;
    }
    if (s.phase === "defend") {
      perform(s, { type: "take" }, s.players[s.turn].id, clock);
      continue;
    }
    if (s.phase === "attack") {
      const cards = legalCards(s, s.turn).sort(
        (a, b) => a.rank - b.rank || a.suit.localeCompare(b.suit),
      );
      perform(
        s,
        s.table.length ? { type: "pass" } : { type: "attack", card: cards[0] },
        s.players[s.turn].id,
        clock,
      );
      continue;
    }
    return s;
  }
  throw new GameError(500, "Превышен предел переходов таймера");
}
export function project(s: State, viewerId: string): View {
  const i = s.players.findIndex((p) => p.id === viewerId);
  if (i < 0) throw new GameError(403, "Вы не участник партии");
  const b = s.bonus?.userId === viewerId ? s.bonus : null;
  const c = b ? s.contentSnapshot.find((c) => c.id === b.contentId) : null;
  return JSON.parse(
    JSON.stringify({
      sessionId: s.sessionId,
      hostId: s.hostId,
      settings: s.settings,
      phase: s.phase,
      players: s.players.map(({ hand, ...p }) => ({
        ...p,
        count: hand.length,
      })),
      hand: [...s.players[i].hand],
      deckCount: s.deck.length,
      trump: s.trump,
      discardCount: s.discard.length,
      table: s.table,
      attackerId: s.players[s.attacker].id,
      defenderId: s.players[s.defender].id,
      turnId: s.players[s.turn].id,
      round: s.round,
      limit: s.limit,
      taking: s.taking,
      deadline: s.bonus ? s.bonus.deadline : s.deadline,
      task:
        b && c
          ? {
              id: c.id,
              prompt: c.prompt,
              options: c.options,
              deadline: b.deadline,
            }
          : null,
      feedback: s.feedback?.userId === viewerId ? s.feedback : null,
      final: s.final,
      legalCards: legalCards(s, i),
      canBonus:
        s.turn === i &&
        !s.bonus &&
        !s.players[i].bonusUsed &&
        s.settings.educational &&
        ["attack", "defend"].includes(s.phase),
      canPass:
        s.turn === i && !s.bonus && s.phase === "attack" && s.table.length > 0,
      canTake: s.turn === i && !s.bonus && s.phase === "defend",
    }),
  ) as View;
}
export const result = (s: State): Result | null => s.final;
export const nextDeadline = (s: State): number | null =>
  s.bonus?.deadline ?? s.deadline;
export function cancel(state: State): State {
  const s = clone(state);
  s.phase = "finished";
  s.deadline = null;
  s.bonus = null;
  s.final = {
    sessionId: s.sessionId,
    winnerUserIds: [],
    scores: [],
    outcome: "cancelled",
  };
  return s;
}
