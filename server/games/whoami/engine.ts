// Чистый движок «Кто я». Не зависит от React, DOM, сети и базы.
// Все функции синхронные и не мутируют входные данные: работают с глубокой копией.

import {
  DIFFICULTY_OF,
  LIMITS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PRESENCE,
  SCORE,
  TIMINGS,
  type Action,
  type Answer,
  type Card,
  type Content,
  type Ctx,
  type GameAction,
  type Match,
  type Outcome,
  type Participant,
  type Phase,
  type Result,
  type Settings,
  type State,
  type Tally,
  type Term,
  type TurnRecord,
  type View,
  type ViewCard,
  type ViewTurn,
} from "../../../shared/games/whoami/types";
import { matchesAnswer } from "../../../shared/games/whoami/text";

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
  previousTermIds?: string[];
}

const clone = <T>(value: T): T => structuredClone(value);

export const ACTIVE_PHASES: readonly Phase[] = ["assign", "asking", "peerVote", "guessing", "nextTurn"];

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
  if (durationMs === null) {
    state.deadline = null;
    return;
  }
  // Общий предел партии: ни одна фаза не заканчивается позже него.
  const limit = state.match?.endsAt ?? Number.POSITIVE_INFINITY;
  state.deadline = Math.min(at + durationMs, limit);
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

function cardOf(match: Match, playerId: string): Card | undefined {
  return match.cards.find((c) => c.playerId === playerId);
}

function termOf(state: State, termId: string): Term {
  const term = state.content.terms.find((t) => t.id === termId);
  if (!term) throw new EngineError("content", "Термин партии не найден в снимке контента");
  return term;
}

/** Термины, подходящие под настройку сложности. */
export function eligiblePool(content: Content, settings: Settings): Term[] {
  if (settings.difficulty === "any") return content.terms;
  const wanted = DIFFICULTY_OF[settings.difficulty];
  return content.terms.filter((t) => t.difficulty === wanted);
}

export function scoreFor(turnsBefore: number): number {
  return Math.max(SCORE.floor, SCORE.base - SCORE.step * turnsBefore);
}

// ---------- создание и лобби ----------

export function create(input: CreateInput): State {
  if (input.participants.length === 0) throw new EngineError("empty", "Нельзя создать партию без участников");
  if (!input.participants.some((p) => p.id === input.hostId)) throw new EngineError("illegal", "Ведущий должен быть участником");
  const now = input.ctx.nowMs;
  return {
    kind: "rr-whoami-state",
    schema: 1,
    sessionId: input.sessionId,
    hostId: input.hostId,
    settings: clone(input.settings),
    phase: "lobby",
    phaseStartedAt: now,
    deadline: null,
    participants: input.participants.map((p, index) => ({ id: p.id, username: p.username, joinedAt: now + index, ready: false, online: true, left: false })),
    content: clone(input.contentSnapshot),
    previousTermIds: [...(input.previousTermIds ?? [])],
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
    if (next.phase === "finished" || next.phase === "cancelled") throw new EngineError("illegal", "Партия уже завершена");
    existing.left = false;
    existing.online = true;
    return next;
  }
  if (next.phase !== "lobby") throw new EngineError("illegal", "Партия уже началась: новые игроки не входят в состав");
  if (next.participants.length >= MAX_PLAYERS) throw new EngineError("illegal", `В комнате уже ${MAX_PLAYERS} игроков`);
  const lastJoined = next.participants.reduce((max, p) => Math.max(max, p.joinedAt), 0);
  next.participants.push({ id: user.id, username: user.username, joinedAt: Math.max(ctx.nowMs, lastJoined + 1), ready: false, online: true, left: false });
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
  const pool = eligiblePool(state.content, state.settings).length;
  if (pool < active.length) blockers.push(`Недостаточно терминов: опубликовано ${pool}, нужно не меньше ${active.length} — по одному на игрока без повторов`);
  return blockers;
}

export function start(state: State, actorId: string, ctx: Ctx): State {
  if (state.phase !== "lobby") throw new EngineError("illegal", "Партия уже идёт");
  if (state.hostId !== actorId) throw new EngineError("forbidden", "Начать партию может только ведущий");
  const active = state.participants.filter((p) => !p.left);
  const pool = eligiblePool(state.content, state.settings);
  if (pool.length < active.length) {
    throw new EngineError("content", `Недостаточно опубликованных терминов: ${pool.length} из ${active.length} нужных. Партию начать нельзя`);
  }
  const blockers = startBlockers(state);
  if (blockers.length > 0) throw new EngineError("illegal", blockers.join(". "));
  const next = clone(state);
  const fresh = pool.filter((t) => !next.previousTermIds.includes(t.id));
  const source = fresh.length >= active.length ? fresh : pool;
  const dealt = shuffle(source, ctx).slice(0, active.length);
  const order = shuffle(
    active.map((p) => p.id),
    ctx,
  );
  next.match = {
    cards: active.map((p, index) => ({ playerId: p.id, termId: (dealt[index] as Term).id, solved: false, turnsTaken: 0, score: 0 })),
    order,
    cursor: -1,
    turn: null,
    history: [],
    startedAt: ctx.nowMs,
    endsAt: ctx.nowMs + TIMINGS.matchMs,
  };
  next.outcome = null;
  setPhase(next, "assign", ctx.nowMs, TIMINGS.assignMs);
  return next;
}

export function rematch(state: State, newSessionId: string, actorId: string, ctx: Ctx): State {
  if (state.phase !== "finished" && state.phase !== "cancelled") throw new EngineError("illegal", "Реванш доступен после окончания партии");
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
    previousTermIds: state.match?.cards.map((c) => c.termId) ?? state.previousTermIds,
  });
}

// ---------- ход партии ----------

function canTakeTurn(state: State, match: Match, playerId: string): boolean {
  const p = participant(state, playerId);
  const card = cardOf(match, playerId);
  return Boolean(p && !p.left && card && !card.solved && card.turnsTaken < LIMITS.maxPersonalTurns);
}

function computeOutcome(state: State, match: Match): Outcome {
  const scores = state.participants.map((p) => ({ userId: p.id, score: cardOf(match, p.id)?.score ?? 0 }));
  const best = Math.max(0, ...scores.map((s) => s.score));
  const winnerIds = best > 0 ? scores.filter((s) => s.score === best).map((s) => s.userId) : [];
  return { scores, winnerIds, draw: best === 0 };
}

function finish(state: State, at: number): void {
  const match = requireMatch(state);
  if (match.turn) {
    match.history.push({ ...match.turn, timedOut: match.turn.timedOut ?? "limit" });
    match.turn = null;
  }
  state.outcome = computeOutcome(state, match);
  setPhase(state, "finished", at, null);
}

/** Следующий спрашивающий по кругу: пропускает угадавших, вышедших и исчерпавших 8 ходов. */
function beginNextTurn(state: State, at: number): void {
  const match = requireMatch(state);
  if (at >= match.endsAt) {
    finish(state, at);
    return;
  }
  const size = match.order.length;
  for (let step = 1; step <= size; step += 1) {
    const index = (((match.cursor + step) % size) + size) % size;
    const askerId = match.order[index] as string;
    if (!canTakeTurn(state, match, askerId)) continue;
    match.cursor = index;
    state.seq += 1;
    match.turn = {
      seq: state.seq,
      askerId,
      turnNumber: (cardOf(match, askerId)?.turnsTaken ?? 0) + 1,
      question: null,
      votes: {},
      tally: null,
      answer: null,
      guess: null,
      skipped: false,
      timedOut: null,
      startedAt: at,
    };
    setPhase(state, "asking", at, TIMINGS.askMs);
    return;
  }
  finish(state, at);
}

/** Завершает личный ход: +1 к счётчику, запись в историю, короткая пауза перед следующим. */
function endTurn(state: State, at: number): void {
  const match = requireMatch(state);
  const turn = match.turn;
  if (!turn) return;
  const card = cardOf(match, turn.askerId);
  if (card) card.turnsTaken += 1;
  match.history.push(turn);
  match.turn = null;
  if (at >= match.endsAt) {
    finish(state, at);
    return;
  }
  setPhase(state, "nextTurn", at, TIMINGS.nextTurnMs);
}

export function tallyOf(votes: Readonly<Record<string, Answer>>): Tally {
  const tally: Tally = { yes: 0, no: 0, ambiguous: 0 };
  for (const answer of Object.values(votes)) tally[answer] += 1;
  return tally;
}

/** Большинство среди поданных голосов; равенство лидеров или ноль голосов — «Неоднозначно». */
export function majorityAnswer(tally: Tally): Answer {
  const entries: [Answer, number][] = [
    ["yes", tally.yes],
    ["no", tally.no],
    ["ambiguous", tally.ambiguous],
  ];
  const best = Math.max(...entries.map(([, count]) => count));
  if (best === 0) return "ambiguous";
  const leaders = entries.filter(([, count]) => count === best);
  return leaders.length === 1 ? (leaders[0] as [Answer, number])[0] : "ambiguous";
}

function resolveVote(state: State, at: number): void {
  const match = requireMatch(state);
  const turn = match.turn;
  if (!turn) return;
  turn.tally = tallyOf(turn.votes);
  turn.answer = majorityAnswer(turn.tally);
  setPhase(state, "guessing", at, TIMINGS.guessMs);
}

function voters(state: State, match: Match): Participant[] {
  return state.participants.filter((p) => !p.left && p.id !== match.turn?.askerId);
}

/** Досрочные переходы, не зависящие от таймера. */
function settle(state: State, at: number): void {
  const match = state.match;
  const turn = match?.turn;
  if (!match || !turn) return;
  const asker = participant(state, turn.askerId);
  if (asker?.left && (state.phase === "asking" || state.phase === "peerVote" || state.phase === "guessing")) {
    turn.skipped = true;
    endTurn(state, at);
    return;
  }
  if (state.phase === "peerVote" && voters(state, match).every((p) => turn.votes[p.id] !== undefined)) resolveVote(state, at);
}

function onDeadline(state: State, at: number): void {
  const match = state.match;
  if (match && at >= match.endsAt && isActive(state)) {
    if (match.turn) match.turn.timedOut = "limit";
    finish(state, at);
    return;
  }
  switch (state.phase) {
    case "assign":
    case "nextTurn":
      beginNextTurn(state, at);
      return;
    case "asking": {
      const turn = requireMatch(state).turn;
      if (turn) turn.timedOut = "ask";
      endTurn(state, at);
      return;
    }
    case "peerVote":
      resolveVote(state, at);
      return;
    case "guessing": {
      const turn = requireMatch(state).turn;
      if (turn) turn.timedOut = "guess";
      endTurn(state, at);
      return;
    }
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

function requireTurn(state: State, phase: Phase, phaseMessage: string): { match: Match; turn: TurnRecord } {
  if (state.phase !== phase) throw new EngineError("illegal", phaseMessage);
  const match = requireMatch(state);
  if (!match.turn) throw new EngineError("illegal", phaseMessage);
  return { match, turn: match.turn };
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
    case "ask": {
      const { turn } = requireTurn(next, "asking", "Сейчас не время для вопроса");
      if (turn.askerId !== actorId) throw new EngineError("illegal", "Сейчас спрашивает другой игрок");
      requireBeforeDeadline(next, ctx, "Время на вопрос истекло");
      turn.question = requireText(action.text, LIMITS.questionChars, "Вопрос");
      setPhase(next, "peerVote", ctx.nowMs, TIMINGS.voteMs);
      settle(next, ctx.nowMs);
      return next;
    }
    case "answer": {
      const { turn } = requireTurn(next, "peerVote", "Сейчас не время отвечать");
      if (turn.askerId === actorId) throw new EngineError("illegal", "Спрашивающий не отвечает на свой вопрос");
      requireBeforeDeadline(next, ctx, "Голосование уже закончилось");
      if (turn.votes[actorId] !== undefined) throw new EngineError("illegal", "Вы уже ответили на этот вопрос");
      turn.votes[actorId] = action.answer;
      settle(next, ctx.nowMs);
      return next;
    }
    case "guess": {
      const { match, turn } = requireTurn(next, "guessing", "Сейчас не время угадывать");
      if (turn.askerId !== actorId) throw new EngineError("illegal", "Угадывает только спрашивающий");
      requireBeforeDeadline(next, ctx, "Время на предположение истекло");
      const text = requireText(action.text, LIMITS.guessChars, "Предположение");
      const card = cardOf(match, actorId);
      if (!card) throw new EngineError("illegal", "У вас нет таблички");
      const term = termOf(next, card.termId);
      const correct = matchesAnswer(text, [term.term, ...term.acceptedAnswers], term.equivalenceYo);
      turn.guess = { text, correct };
      if (correct) {
        card.solved = true;
        card.score = scoreFor(card.turnsTaken);
      }
      endTurn(next, ctx.nowMs);
      return next;
    }
    case "skipGuess": {
      const { turn } = requireTurn(next, "guessing", "Сейчас не время угадывать");
      if (turn.askerId !== actorId) throw new EngineError("illegal", "Пропустить может только спрашивающий");
      requireBeforeDeadline(next, ctx, "Время на предположение истекло");
      turn.skipped = true;
      endTurn(next, ctx.nowMs);
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
      outcome: state.outcome.draw ? "draw" : "win",
    };
  }
  if (state.phase === "cancelled" && state.match) {
    return { sessionId: state.sessionId, winnerUserIds: [], scores: state.participants.map((p) => ({ userId: p.id, score: 0 })), outcome: "cancelled" };
  }
  return null;
}

// ---------- проекция ----------

function projectTurn(turn: TurnRecord, viewerId: string, showTally: boolean): ViewTurn {
  return {
    seq: turn.seq,
    askerId: turn.askerId,
    turnNumber: turn.turnNumber,
    question: turn.question,
    votedIds: Object.keys(turn.votes),
    myAnswer: turn.votes[viewerId] ?? null,
    tally: showTally ? turn.tally : null,
    answer: showTally ? turn.answer : null,
    guess: turn.guess ? { ...turn.guess } : null,
    skipped: turn.skipped,
    timedOut: turn.timedOut,
  };
}

function projectCards(state: State, match: Match, viewerId: string): ViewCard[] {
  const isPlayer = state.participants.some((p) => p.id === viewerId);
  const finished = state.phase === "finished" || state.phase === "cancelled";
  return state.participants
    .map((p) => cardOf(match, p.id))
    .filter((card): card is Card => card !== undefined)
    .map((card) => {
      const term = termOf(state, card.termId);
      // Своя неугаданная табличка скрыта; зрителю скрыты все неугаданные — он не может подсказать.
      const hidden = !finished && !card.solved && (card.playerId === viewerId || !isPlayer);
      return {
        playerId: card.playerId,
        term: hidden ? null : term.term,
        category: hidden ? null : term.category,
        definition: card.solved || finished ? term.definition : null,
        hidden,
        solved: card.solved,
        turnsTaken: card.turnsTaken,
        score: card.solved ? card.score : null,
      };
    });
}

export function project(state: State, viewerId: string): View {
  const me = participant(state, viewerId);
  const match = state.phase === "lobby" ? null : state.match;
  const turnTallyVisible = state.phase === "guessing" || state.phase === "nextTurn";
  return {
    kind: "rr-whoami-view",
    sessionId: state.sessionId,
    phase: state.phase,
    viewerId,
    isParticipant: me !== undefined && !me.left,
    hostId: state.hostId,
    settings: { ...state.settings },
    phaseStartedAt: state.phaseStartedAt,
    deadline: state.deadline,
    matchEndsAt: match ? match.endsAt : null,
    participants: [...state.participants]
      .sort((x, y) => x.joinedAt - y.joinedAt)
      .map((p) => ({ id: p.id, username: p.username, ready: p.ready, online: p.online, left: p.left, isHost: p.id === state.hostId })),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    maxTurns: LIMITS.maxPersonalTurns,
    contentCount: eligiblePool(state.content, state.settings).length,
    startBlockers: state.phase === "lobby" ? startBlockers(state) : [],
    cards: match ? projectCards(state, match, viewerId) : [],
    turn: match?.turn ? projectTurn(match.turn, viewerId, turnTallyVisible) : null,
    history: match ? match.history.map((turn) => projectTurn(turn, viewerId, true)) : [],
    outcome: state.outcome && (state.phase === "finished" || state.phase === "cancelled") ? clone(state.outcome) : null,
    cancelReason: state.cancelReason,
  };
}
