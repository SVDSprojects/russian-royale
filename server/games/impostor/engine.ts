// Чистый движок «Самозванца». Не зависит от React, DOM, сети и базы.
// Все функции синхронные и не мутируют входные данные: работают с глубокой копией.

import {
  LIMITS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PRESENCE,
  SCORE,
  SKIP_TEXT,
  TIMINGS,
  type Action,
  type Content,
  type Ctx,
  type ExampleEntry,
  type GameAction,
  type Match,
  type Outcome,
  type Pair,
  type Participant,
  type Phase,
  type Result,
  type Settings,
  type Side,
  type State,
  type Tally,
  type Topic,
  type View,
  type ViewTopic,
} from "../../../shared/games/impostor/types";
import { findForbidden } from "../../../shared/games/impostor/text";

export type EngineErrorCode = "illegal" | "forbidden" | "rate" | "content" | "empty";

/** Ожидаемый отказ: незаконный ход, нет прав, слишком часто, нет контента, пустой состав. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}

export interface CreateInput {
  sessionId: string;
  hostId: string;
  participants: { id: string; username: string }[];
  settings: Settings;
  contentSnapshot: Content;
  ctx: Ctx;
  previousPairId?: string | null;
}

const clone = <T>(value: T): T => structuredClone(value);

export const ACTIVE_PHASES: readonly Phase[] = ["deal", "examples", "discussion", "voting", "reveal"];

export function isActive(state: State): boolean {
  return ACTIVE_PHASES.includes(state.phase);
}

function participant(state: State, userId: string): Participant | undefined {
  return state.participants.find((p) => p.id === userId);
}

function requireActor(state: State, actorId: string): Participant {
  const actor = participant(state, actorId);
  if (!actor || actor.left) throw new EngineError("forbidden", "Вы не участвуете в этой партии");
  return actor;
}

function setPhase(state: State, phase: Phase, at: number, durationMs: number | null): void {
  state.phase = phase;
  state.phaseStartedAt = at;
  state.deadline = durationMs === null ? null : at + durationMs;
}

function shuffle<T>(items: readonly T[], ctx: Ctx): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = ctx.randomInt(i + 1);
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

function requireMatch(state: State): Match {
  if (!state.match) throw new EngineError("illegal", "Партия ещё не началась");
  return state.match;
}

function pairOf(state: State, match: Match): Pair {
  const pair = state.content.pairs.find((p) => p.id === match.pairId);
  if (!pair) throw new EngineError("content", "Пара тем партии не найдена в снимке контента");
  return pair;
}

const otherSide = (side: Side): Side => (side === "a" ? "b" : "a");

function topicFor(state: State, userId: string): Topic | null {
  const match = state.match;
  if (!match) return null;
  const pair = pairOf(state, match);
  const side = userId === match.impostorId ? match.impostorSide : otherSide(match.impostorSide);
  return pair[side];
}

export function majorityNeeded(total: number): number {
  return Math.floor(total / 2) + 1;
}

// ---------- создание и лобби ----------

export function create(input: CreateInput): State {
  if (input.participants.length === 0) throw new EngineError("empty", "Нельзя создать партию без участников");
  if (!input.participants.some((p) => p.id === input.hostId)) {
    throw new EngineError("illegal", "Ведущий должен быть участником");
  }
  const now = input.ctx.nowMs;
  return {
    kind: "rr-impostor-state",
    schema: 1,
    sessionId: input.sessionId,
    hostId: input.hostId,
    settings: clone(input.settings),
    phase: "lobby",
    phaseStartedAt: now,
    deadline: null,
    participants: input.participants.map((p, index) => ({
      id: p.id,
      username: p.username,
      joinedAt: now + index,
      ready: false,
      online: true,
      left: false,
    })),
    content: clone(input.contentSnapshot),
    previousPairId: input.previousPairId ?? null,
    match: null,
    outcome: null,
    cancelReason: null,
    seq: 0,
  };
}

export function join(state: State, user: { id: string; username: string }, ctx: Ctx): State {
  const next = clone(state);
  const existing = participant(next, user.id);
  if (existing) {
    if (!existing.left) return next;
    if (next.phase === "finished" || next.phase === "cancelled") {
      throw new EngineError("illegal", "Партия уже завершена");
    }
    existing.left = false;
    existing.online = true;
    return next;
  }
  if (next.phase !== "lobby") throw new EngineError("illegal", "Партия уже началась: новые игроки не входят в состав");
  if (next.participants.length >= MAX_PLAYERS) throw new EngineError("illegal", `В комнате уже ${MAX_PLAYERS} игроков`);
  const lastJoined = next.participants.reduce((max, p) => Math.max(max, p.joinedAt), 0);
  next.participants.push({
    id: user.id,
    username: user.username,
    joinedAt: Math.max(ctx.nowMs, lastJoined + 1),
    ready: false,
    online: true,
    left: false,
  });
  return next;
}

function firstActiveBy(state: State, predicate: (p: Participant) => boolean): Participant | undefined {
  return [...state.participants].sort((x, y) => x.joinedAt - y.joinedAt).find((p) => !p.left && predicate(p));
}

function cancel(state: State, at: number, reason: string): void {
  setPhase(state, "cancelled", at, null);
  state.cancelReason = reason;
}

export function leave(state: State, userId: string, ctx: Ctx): State {
  const next = clone(state);
  const leaver = participant(next, userId);
  if (!leaver || leaver.left) return next;
  if (next.phase === "lobby") {
    next.participants = next.participants.filter((p) => p.id !== userId);
  } else {
    leaver.left = true;
    leaver.online = false;
    leaver.ready = false;
  }
  if (next.hostId === userId) {
    const successor = firstActiveBy(next, (p) => p.online) ?? firstActiveBy(next, () => true);
    if (successor) next.hostId = successor.id;
  }
  if (!next.participants.some((p) => !p.left)) {
    if (next.phase !== "finished" && next.phase !== "cancelled") cancel(next, ctx.nowMs, "Все игроки покинули комнату");
    return next;
  }
  if (isActive(next)) settle(next, ctx.nowMs);
  return next;
}

export function setReady(state: State, userId: string, ready: boolean): State {
  if (state.phase !== "lobby") throw new EngineError("illegal", "Готовность меняется только в лобби");
  const next = clone(state);
  requireActor(next, userId).ready = ready;
  return next;
}

/** Обновляет снимок контента, пока партия не началась. После старта снимок неизменен. */
export function withContent(state: State, content: Content): State {
  if (state.phase !== "lobby") return state;
  const next = clone(state);
  next.content = clone(content);
  return next;
}

export function startBlockers(state: State): string[] {
  const blockers: string[] = [];
  const active = state.participants.filter((p) => !p.left);
  if (active.length < MIN_PLAYERS) blockers.push(`Нужно минимум ${MIN_PLAYERS} игрока — сейчас ${active.length}`);
  if (active.length > MAX_PLAYERS) blockers.push(`Не больше ${MAX_PLAYERS} игроков`);
  const notReady = active.filter((p) => !p.ready).length;
  if (notReady > 0) blockers.push(`Не готовы: ${notReady}`);
  if (state.content.pairs.length === 0) blockers.push("Нет опубликованных пар тем — нужен контент");
  return blockers;
}

export function start(state: State, actorId: string, ctx: Ctx): State {
  if (state.phase !== "lobby") throw new EngineError("illegal", "Партия уже идёт");
  if (state.hostId !== actorId) throw new EngineError("forbidden", "Начать партию может только ведущий");
  if (state.content.pairs.length === 0) throw new EngineError("content", "Нет опубликованных пар тем — партию начать нельзя");
  const blockers = startBlockers(state);
  if (blockers.length > 0) throw new EngineError("illegal", blockers.join(". "));
  const next = clone(state);
  const pool = next.content.pairs.filter((p) => p.id !== next.previousPairId);
  const candidates = pool.length > 0 ? pool : next.content.pairs;
  const pair = candidates[ctx.randomInt(candidates.length)] as Pair;
  const ids = next.participants.map((p) => p.id);
  const impostorId = ids[ctx.randomInt(ids.length)] as string;
  next.match = {
    pairId: pair.id,
    impostorId,
    impostorSide: ctx.randomInt(2) === 0 ? "a" : "b",
    order: shuffle(ids, ctx),
    round: 1,
    turn: 0,
    examples: [],
    chat: [],
    votes: {},
    startedAt: ctx.nowMs,
  };
  next.outcome = null;
  setPhase(next, "deal", ctx.nowMs, TIMINGS.dealMs);
  return next;
}

export function rematch(state: State, newSessionId: string, actorId: string, ctx: Ctx): State {
  if (state.phase !== "finished" && state.phase !== "cancelled") {
    throw new EngineError("illegal", "Реванш доступен после окончания партии");
  }
  if (state.hostId !== actorId) throw new EngineError("forbidden", "Реванш запускает ведущий");
  const stay = [...state.participants].filter((p) => !p.left).sort((x, y) => x.joinedAt - y.joinedAt);
  if (stay.length === 0) throw new EngineError("empty", "В комнате не осталось игроков");
  return create({
    sessionId: newSessionId,
    hostId: actorId,
    participants: stay.map((p) => ({ id: p.id, username: p.username })),
    settings: state.settings,
    contentSnapshot: state.content,
    ctx,
    previousPairId: state.match?.pairId ?? state.previousPairId,
  });
}

// ---------- ход партии ----------

function currentTurnId(match: Match): string | null {
  return match.order[match.turn] ?? null;
}

function pushExample(state: State, match: Match, authorId: string, text: string, skipped: boolean, at: number): void {
  state.seq += 1;
  const entry: ExampleEntry = { seq: state.seq, round: match.round, authorId, text, skipped, at };
  match.examples.push(entry);
}

/** Возвращает true, если продолжается круг примеров. */
function moveToNextTurn(state: State, at: number): boolean {
  const match = requireMatch(state);
  match.turn += 1;
  if (match.turn < match.order.length) {
    state.phaseStartedAt = at;
    state.deadline = at + TIMINGS.exampleMs;
    return true;
  }
  if (match.round === 1) {
    setPhase(state, "discussion", at, TIMINGS.discussionMs);
  } else {
    setPhase(state, "voting", at, TIMINGS.votingMs);
  }
  return false;
}

/** Игрок, покинувший партию, пропускает ход сразу — остальным не нужно ждать. */
function skipLeftPlayers(state: State, at: number): void {
  const match = requireMatch(state);
  for (let guard = 0; guard <= MAX_PLAYERS && state.phase === "examples"; guard += 1) {
    const id = currentTurnId(match);
    const author = id ? participant(state, id) : undefined;
    if (!author || !author.left) return;
    pushExample(state, match, author.id, SKIP_TEXT, true, at);
    moveToNextTurn(state, at);
  }
}

function beginRound(state: State, round: 1 | 2, at: number): void {
  const match = requireMatch(state);
  match.round = round;
  match.turn = 0;
  setPhase(state, "examples", at, TIMINGS.exampleMs);
  skipLeftPlayers(state, at);
}

function finishTurn(state: State, at: number): void {
  if (moveToNextTurn(state, at)) skipLeftPlayers(state, at);
}

function computeOutcome(state: State, match: Match): Outcome {
  const counts = new Map<string, number>();
  for (const target of Object.values(match.votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  const needed = majorityNeeded(state.participants.length);
  let accusedId: string | null = null;
  for (const [target, count] of counts) if (count >= needed) accusedId = target;
  const winner = accusedId === match.impostorId ? "majority" : "impostor";
  const winnerIds =
    winner === "majority"
      ? state.participants.filter((p) => p.id !== match.impostorId).map((p) => p.id)
      : [match.impostorId];
  const scores = state.participants.map((p) => ({
    userId: p.id,
    score: winnerIds.includes(p.id) ? SCORE.winner : SCORE.loser,
  }));
  return { accusedId, winner, winnerIds, scores };
}

function toReveal(state: State, at: number): void {
  const match = requireMatch(state);
  state.outcome = computeOutcome(state, match);
  setPhase(state, "reveal", at, TIMINGS.revealMs);
}

/** Досрочные переходы, не зависящие от таймера. */
function settle(state: State, at: number): void {
  const match = state.match;
  if (!match) return;
  if (state.phase === "examples") skipLeftPlayers(state, at);
  if (state.phase === "voting") {
    const voters = state.participants.filter((p) => !p.left);
    if (voters.every((p) => match.votes[p.id] !== undefined)) toReveal(state, at);
  }
}

function onDeadline(state: State, at: number): void {
  switch (state.phase) {
    case "deal":
      beginRound(state, 1, at);
      return;
    case "examples": {
      const match = requireMatch(state);
      const id = currentTurnId(match);
      if (id !== null) pushExample(state, match, id, SKIP_TEXT, true, at);
      finishTurn(state, at);
      return;
    }
    case "discussion":
      beginRound(state, 2, at);
      return;
    case "voting":
      toReveal(state, at);
      return;
    case "reveal":
      setPhase(state, "finished", at, null);
      return;
    default:
      state.deadline = null;
  }
}

/** Обрабатывает все просроченные этапы. Новый дедлайн отсчитывается от предыдущего. */
export function advance(state: State, ctx: Ctx): State {
  if (state.deadline === null || ctx.nowMs < state.deadline) return state;
  const next = clone(state);
  let steps = 0;
  while (next.deadline !== null && ctx.nowMs >= next.deadline && steps < LIMITS.maxAdvanceSteps) {
    onDeadline(next, next.deadline);
    steps += 1;
  }
  return next;
}

export function nextDeadline(state: State): number | null {
  return state.deadline;
}

function requireText(raw: string, max: number, label: string): string {
  const text = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (text.length === 0) throw new EngineError("illegal", `${label}: пустой текст`);
  if (text.length > max) throw new EngineError("illegal", `${label}: максимум ${max} символов`);
  return text;
}

/** Таймер считается истёкшим уже на границе nowMs === deadline. */
function requireBeforeDeadline(state: State, ctx: Ctx, message: string): void {
  if (state.deadline === null || ctx.nowMs >= state.deadline) throw new EngineError("illegal", message);
}

export function apply(state: State, action: Action, actorId: string, ctx: Ctx): State {
  requireActor(state, actorId);
  switch (action.type) {
    case "ready":
      return setReady(state, actorId, action.ready);
    case "start":
      return start(state, actorId, ctx);
    case "leave":
      return leave(state, actorId, ctx);
    case "rematch":
      throw new EngineError("illegal", "Реванш создаёт новую сессию: используйте rematch(state, newSessionId, …)");
    default:
      return applyGameAction(state, action, actorId, ctx);
  }
}

function applyGameAction(state: State, action: GameAction, actorId: string, ctx: Ctx): State {
  const next = clone(state);
  switch (action.type) {
    case "settings": {
      if (next.phase !== "lobby") throw new EngineError("illegal", "Настройки меняются только в лобби");
      if (next.hostId !== actorId) throw new EngineError("forbidden", "Настройки меняет ведущий");
      next.settings = clone(action.settings);
      return next;
    }
    case "example": {
      if (next.phase !== "examples") throw new EngineError("illegal", "Сейчас не время для примеров");
      const match = requireMatch(next);
      if (currentTurnId(match) !== actorId) throw new EngineError("illegal", "Сейчас ход другого игрока");
      requireBeforeDeadline(next, ctx, "Время хода истекло");
      const text = requireText(action.text, LIMITS.exampleChars, "Пример");
      const topic = topicFor(next, actorId);
      const hit = topic ? findForbidden(text, topic.forbiddenWords) : null;
      if (hit) {
        const shown = hit.endsWith("*") ? `${hit.slice(0, -1)}…` : hit;
        throw new EngineError("illegal", `«${shown}» — запретное слово вашей темы. Ход не потрачен — попробуйте иначе`);
      }
      pushExample(next, match, actorId, text, false, ctx.nowMs);
      finishTurn(next, ctx.nowMs);
      return next;
    }
    case "chat": {
      if (!next.settings.chat) throw new EngineError("illegal", "Чат отключён ведущим");
      if (next.phase !== "discussion" && next.phase !== "voting") {
        throw new EngineError("illegal", "Чат открыт во время обсуждения и голосования");
      }
      const match = requireMatch(next);
      const text = requireText(action.text, LIMITS.chatChars, "Сообщение");
      const last = [...match.chat].reverse().find((c) => c.authorId === actorId);
      if (last && ctx.nowMs - last.at < LIMITS.chatIntervalMs) throw new EngineError("rate", "Слишком часто: подождите секунду");
      next.seq += 1;
      match.chat.push({ seq: next.seq, authorId: actorId, text, at: ctx.nowMs });
      if (match.chat.length > LIMITS.chatHistory) match.chat = match.chat.slice(-LIMITS.chatHistory);
      return next;
    }
    case "vote": {
      if (next.phase !== "voting") throw new EngineError("illegal", "Голосование ещё не началось");
      const match = requireMatch(next);
      requireBeforeDeadline(next, ctx, "Голосование завершено");
      if (match.votes[actorId] !== undefined) throw new EngineError("illegal", "Голос уже отдан и не меняется");
      if (action.targetId === actorId) throw new EngineError("illegal", "Нельзя голосовать за себя");
      if (!participant(next, action.targetId)) throw new EngineError("illegal", "Такого участника нет");
      match.votes[actorId] = action.targetId;
      settle(next, ctx.nowMs);
      return next;
    }
  }
}

/** Момент, когда отсутствие всех участников достигнет 10 минут. Таймеры до него обрабатываются раньше отмены. */
export function absenceCutoff(state: State, lastSeen: Readonly<Record<string, number>>): number | null {
  const active = state.participants.filter((p) => !p.left);
  if (active.length === 0) return null;
  return Math.max(...active.map((p) => lastSeen[p.id] ?? p.joinedAt)) + PRESENCE.allAbsentMs;
}

/** Отметки присутствия, передача ведущего через 45 с, отмена при отсутствии всех 10 минут. */
export function syncPresence(state: State, lastSeen: Readonly<Record<string, number>>, nowMs: number): State {
  if (state.phase === "finished" || state.phase === "cancelled") return state;
  const next = clone(state);
  const seenAt = (p: Participant) => lastSeen[p.id] ?? p.joinedAt;
  for (const p of next.participants) p.online = !p.left && nowMs - seenAt(p) < PRESENCE.onlineWindowMs;
  const active = next.participants.filter((p) => !p.left);
  if (active.length > 0 && active.every((p) => nowMs - seenAt(p) >= PRESENCE.allAbsentMs)) {
    cancel(next, nowMs, "Все участники отсутствовали 10 минут");
    return next;
  }
  const host = participant(next, next.hostId);
  if (!host || host.left || nowMs - seenAt(host) >= PRESENCE.hostAbsentMs) {
    const successor = firstActiveBy(next, (p) => p.online && p.id !== next.hostId);
    if (successor) next.hostId = successor.id;
  }
  return next;
}

export function result(state: State): Result | null {
  if (state.phase === "finished" && state.outcome) {
    return {
      sessionId: state.sessionId,
      winnerUserIds: [...state.outcome.winnerIds],
      scores: state.outcome.scores.map((s) => ({ ...s })),
      outcome: "win",
    };
  }
  if (state.phase === "cancelled" && state.match) {
    return {
      sessionId: state.sessionId,
      winnerUserIds: [],
      scores: state.participants.map((p) => ({ userId: p.id, score: 0 })),
      outcome: "cancelled",
    };
  }
  return null;
}

// ---------- проекция ----------

const publicTopic = (topic: Topic): ViewTopic => ({ title: topic.title, description: topic.description });

function tallyOf(votes: Record<string, string>): Tally[] {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  return [...counts.entries()].map(([targetId, count]) => ({ targetId, count })).sort((x, y) => y.count - x.count);
}

function revealOf(state: State): View["reveal"] {
  const match = state.match;
  const outcome = state.outcome;
  if (!match || !outcome || (state.phase !== "reveal" && state.phase !== "finished")) return null;
  const pair = pairOf(state, match);
  const majority = pair[otherSide(match.impostorSide)];
  const impostor = pair[match.impostorSide];
  return {
    pairTitle: pair.title,
    difference: pair.difference,
    majorityTopic: { ...publicTopic(majority), examples: [...majority.examples] },
    impostorTopic: { ...publicTopic(impostor), examples: [...impostor.examples] },
    impostorId: match.impostorId,
    accusedId: outcome.accusedId,
    winner: outcome.winner,
    votes: { ...match.votes },
    tally: tallyOf(match.votes),
    scores: outcome.scores.map((s) => ({ ...s })),
  };
}

export function project(state: State, viewerId: string): View {
  const me = participant(state, viewerId);
  const match = state.phase === "lobby" ? null : state.match;
  const showOwnTopic = me !== undefined && match !== null && state.phase !== "cancelled";
  const ownTopic = showOwnTopic ? topicFor(state, viewerId) : null;
  return {
    kind: "rr-impostor-view",
    sessionId: state.sessionId,
    phase: state.phase,
    viewerId,
    isParticipant: me !== undefined && !me.left,
    hostId: state.hostId,
    settings: { ...state.settings },
    phaseStartedAt: state.phaseStartedAt,
    deadline: state.deadline,
    participants: [...state.participants]
      .sort((x, y) => x.joinedAt - y.joinedAt)
      .map((p) => ({ id: p.id, username: p.username, ready: p.ready, online: p.online, left: p.left, isHost: p.id === state.hostId })),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    contentCount: state.content.pairs.length,
    startBlockers: state.phase === "lobby" ? startBlockers(state) : [],
    myTopic: ownTopic ? publicTopic(ownTopic) : null,
    round: match ? match.round : null,
    order: match ? [...match.order] : [],
    currentTurnId: state.phase === "examples" && match ? currentTurnId(match) : null,
    examples: match ? match.examples.map((e) => ({ ...e })) : [],
    chat: match ? match.chat.map((c) => ({ ...c })) : [],
    votedIds: match ? Object.keys(match.votes) : [],
    myVote: match ? match.votes[viewerId] ?? null : null,
    majorityNeeded: majorityNeeded(state.participants.length),
    reveal: revealOf(state),
    cancelReason: state.cancelReason,
  };
}
