// Чистый движок «Alias». Не зависит от React, DOM, сети и базы.
// Все функции синхронные и не мутируют входные данные: работают с глубокой копией.

import {
  LIMITS,
  MAX_PLAYERS,
  MAX_TEAMS,
  MIN_CARDS,
  MIN_PLAYERS,
  MIN_TEAM_SIZE,
  PRESENCE,
  TEAMS,
  TIMINGS,
  type Action,
  type Card,
  type Content,
  type Ctx,
  type GameAction,
  type HistoryCard,
  type Match,
  type MyRole,
  type Outcome,
  type Participant,
  type Phase,
  type Result,
  type RevealedCard,
  type Settings,
  type State,
  type TeamHistory,
  type Turn,
  type TurnCard,
  type TurnEnd,
  type TurnSummary,
  type View,
} from "../../../shared/games/alias/types";
import { answerKey, explanationDictionary, findForbidden } from "../../../shared/games/alias/text";

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
  participants: { id: string; username: string; team?: number }[];
  settings: Settings;
  contentSnapshot: Content;
  ctx: Ctx;
}

const clone = <T>(value: T): T => structuredClone(value);

export const ACTIVE_PHASES: readonly Phase[] = ["prepare", "explaining", "turnResult"];

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

function byJoin(a: Participant, b: Participant): number {
  return a.joinedAt - b.joinedAt;
}

function activeMembers(state: State, team: number): Participant[] {
  return state.participants.filter((p) => !p.left && p.team === team).sort(byJoin);
}

/** Команда с наименьшим числом игроков (при равенстве — с меньшим номером). */
function smallestTeam(participants: readonly Participant[], teamCount: number): number {
  let best = 0;
  let bestSize = Number.POSITIVE_INFINITY;
  for (let team = 0; team < teamCount; team += 1) {
    const size = participants.filter((p) => !p.left && p.team === team).length;
    if (size < bestSize) {
      best = team;
      bestSize = size;
    }
  }
  return best;
}

export function totalTurns(state: State): number {
  return state.settings.rounds * state.settings.teamCount;
}

function emptyTeams(count: number) {
  return Array.from({ length: count }, () => ({ score: 0, turnsPlayed: 0 }));
}

// ---------- создание и лобби ----------

export function create(input: CreateInput): State {
  if (input.participants.length === 0) throw new EngineError("empty", "Нельзя создать партию без участников");
  if (!input.participants.some((p) => p.id === input.hostId)) throw new EngineError("illegal", "Ведущий должен быть участником");
  const now = input.ctx.nowMs;
  const participants: Participant[] = [];
  input.participants.forEach((p, index) => {
    const wanted = p.team;
    const team = wanted !== undefined && wanted >= 0 && wanted < input.settings.teamCount ? wanted : smallestTeam(participants, input.settings.teamCount);
    participants.push({ id: p.id, username: p.username, joinedAt: now + index, ready: false, online: true, left: false, team });
  });
  return {
    kind: "rr-alias-state",
    schema: 1,
    sessionId: input.sessionId,
    hostId: input.hostId,
    settings: clone(input.settings),
    phase: "lobby",
    phaseStartedAt: now,
    deadline: null,
    participants,
    teams: emptyTeams(input.settings.teamCount),
    content: clone(input.contentSnapshot),
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
  next.participants.push({
    id: user.id,
    username: user.username,
    joinedAt: Math.max(ctx.nowMs, lastJoined + 1),
    ready: false,
    online: true,
    left: false,
    team: smallestTeam(next.participants, next.settings.teamCount),
  });
  return next;
}

function firstActiveBy(state: State, predicate: (p: Participant) => boolean): Participant | undefined {
  return [...state.participants].sort(byJoin).find((p) => !p.left && predicate(p));
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
  // Вышедший объясняющий: ход заканчивается сразу, текущая карточка без штрафа.
  const turn = currentTurn(next);
  if (next.phase === "explaining" && turn?.explainerId === userId) endTurn(next, ctx.nowMs, "explainerLeft");
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
  for (let team = 0; team < state.settings.teamCount; team += 1) {
    const size = activeMembers(state, team).length;
    if (size < MIN_TEAM_SIZE) blockers.push(`В команде «${TEAMS[team]?.name ?? team + 1}» нужно минимум ${MIN_TEAM_SIZE} игрока — сейчас ${size}`);
  }
  const notReady = active.filter((p) => !p.ready).length;
  if (notReady > 0) blockers.push(`Не готовы: ${notReady}`);
  if (state.content.cards.length < MIN_CARDS) blockers.push(`Нужно минимум ${MIN_CARDS} опубликованных карточек — сейчас ${state.content.cards.length}`);
  return blockers;
}

export function start(state: State, actorId: string, ctx: Ctx): State {
  if (state.phase !== "lobby") throw new EngineError("illegal", "Партия уже идёт");
  if (state.hostId !== actorId) throw new EngineError("forbidden", "Начать партию может только ведущий");
  if (state.content.cards.length < MIN_CARDS) {
    throw new EngineError("content", `Недостаточно карточек: нужно ${MIN_CARDS}, опубликовано ${state.content.cards.length}`);
  }
  const blockers = startBlockers(state);
  if (blockers.length > 0) throw new EngineError("illegal", blockers.join(". "));
  const next = clone(state);
  next.teams = emptyTeams(next.settings.teamCount);
  next.outcome = null;
  next.match = {
    deck: shuffle(
      next.content.cards.map((card) => card.id),
      ctx,
    ),
    turns: [],
    cardCounter: 0,
    lastGuessAt: {},
    lastExplanationAt: 0,
    startedAt: ctx.nowMs,
  };
  beginTurn(next, ctx.nowMs, ctx);
  return next;
}

export function rematch(state: State, newSessionId: string, actorId: string, ctx: Ctx): State {
  if (state.phase !== "finished" && state.phase !== "cancelled") throw new EngineError("illegal", "Реванш доступен после окончания партии");
  if (state.hostId !== actorId) throw new EngineError("forbidden", "Реванш запускает ведущий");
  const stay = [...state.participants].filter((p) => !p.left).sort(byJoin);
  if (stay.length === 0) throw new EngineError("empty", "В комнате не осталось игроков");
  return create({
    sessionId: newSessionId,
    hostId: actorId,
    participants: stay.map((p) => ({ id: p.id, username: p.username, team: p.team })),
    settings: state.settings,
    contentSnapshot: state.content,
    ctx,
  });
}

// ---------- ход партии ----------

function requireMatch(state: State): Match {
  if (!state.match) throw new EngineError("illegal", "Партия ещё не началась");
  return state.match;
}

function currentTurn(state: State): Turn | null {
  const turns = state.match?.turns ?? [];
  return turns[turns.length - 1] ?? null;
}

function currentCard(turn: Turn | null): TurnCard | null {
  const last = turn?.cards[turn.cards.length - 1];
  return last && last.outcome === "pending" ? last : null;
}

function cardById(state: State, id: string): Card {
  const card = state.content.cards.find((c) => c.id === id);
  if (!card) throw new EngineError("content", "Карточка не найдена в снимке контента");
  return card;
}

/** Новый ход: команда по кругу, объясняющий — следующий активный участник команды. */
function beginTurn(state: State, at: number, ctx: Ctx): void {
  const match = requireMatch(state);
  const number = match.turns.length + 1;
  const team = (number - 1) % state.settings.teamCount;
  const round = Math.floor((number - 1) / state.settings.teamCount) + 1;
  const members = activeMembers(state, team);
  const teamState = state.teams[team] ?? { score: 0, turnsPlayed: 0 };
  const explainer = members.length > 0 ? (members[teamState.turnsPlayed % members.length] ?? null) : null;
  if (match.deck.length === 0) {
    match.deck = shuffle(
      state.content.cards.map((card) => card.id),
      ctx,
    );
  }
  match.turns.push({ number, round, team, explainerId: explainer?.id ?? null, startedAt: at, cards: [], explanations: [], guesses: [], scoreDelta: 0, endedBy: null });
  setPhase(state, "prepare", at, TIMINGS.prepareMs);
}

/** Выдаёт следующую карточку. Колода исчерпана — ход завершается. */
function drawCard(state: State, at: number): void {
  const match = requireMatch(state);
  const turn = currentTurn(state);
  if (!turn) return;
  const cardId = match.deck.shift();
  if (cardId === undefined) {
    endTurn(state, at, "deck");
    return;
  }
  match.cardCounter += 1;
  turn.cards.push({ seq: match.cardCounter, cardId, outcome: "pending", guessedBy: null, at });
}

function endTurn(state: State, at: number, reason: TurnEnd): void {
  const turn = currentTurn(state);
  if (!turn) return;
  const pending = currentCard(turn);
  if (pending) pending.outcome = "expired";
  turn.endedBy = reason;
  const team = state.teams[turn.team];
  if (team) team.turnsPlayed += 1;
  setPhase(state, "turnResult", at, TIMINGS.turnResultMs);
}

function startExplaining(state: State, at: number): void {
  const turn = currentTurn(state);
  if (!turn) return;
  setPhase(state, "explaining", at, TIMINGS.explainMs);
  if (turn.explainerId === null) {
    endTurn(state, at, "noExplainer");
    return;
  }
  drawCard(state, at);
}

function computeOutcome(state: State): Outcome {
  const teamScores = state.teams.map((team) => team.score);
  const best = Math.max(...teamScores);
  const winnerTeams = teamScores.flatMap((score, index) => (score === best ? [index] : []));
  const winnerIds = state.participants.filter((p) => winnerTeams.includes(p.team)).map((p) => p.id);
  const scores = state.participants.map((p) => ({ userId: p.id, score: teamScores[p.team] ?? 0 }));
  return { teamScores, winnerTeams, winnerIds, scores };
}

function afterTurnResult(state: State, at: number, ctx: Ctx): void {
  const match = requireMatch(state);
  if (match.turns.length >= totalTurns(state)) {
    state.outcome = computeOutcome(state);
    setPhase(state, "finished", at, null);
    return;
  }
  beginTurn(state, at, ctx);
}

function onDeadline(state: State, at: number, ctx: Ctx): void {
  switch (state.phase) {
    case "prepare":
      startExplaining(state, at);
      return;
    case "explaining":
      endTurn(state, at, "timer");
      return;
    case "turnResult":
      afterTurnResult(state, at, ctx);
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
    onDeadline(next, next.deadline, ctx);
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
function requireExplaining(state: State, ctx: Ctx): { turn: Turn; card: TurnCard } {
  if (state.phase !== "explaining") throw new EngineError("illegal", "Сейчас никто не объясняет");
  if (state.deadline === null || ctx.nowMs >= state.deadline) throw new EngineError("illegal", "Время хода истекло");
  const turn = currentTurn(state);
  const card = currentCard(turn);
  if (!turn || !card) throw new EngineError("illegal", "Карточки нет");
  return { turn, card };
}

function requireCardSeq(card: TurnCard, cardSeq: number): void {
  if (card.seq !== cardSeq) throw new EngineError("illegal", "Карточка уже сменилась — смотрите следующую");
}

function lobbyAction(state: State, action: GameAction, actorId: string, ctx: Ctx): State {
  if (state.phase !== "lobby") throw new EngineError("illegal", "Состав и настройки меняются только в лобби");
  if (state.hostId !== actorId) throw new EngineError("forbidden", "Команды и настройки меняет ведущий");
  const next = clone(state);
  if (action.type === "settings") {
    next.settings = clone(action.settings);
    next.teams = emptyTeams(next.settings.teamCount);
    for (const p of next.participants.filter((x) => x.team >= next.settings.teamCount)) {
      p.team = smallestTeam(
        next.participants.filter((x) => x.team < next.settings.teamCount),
        next.settings.teamCount,
      );
    }
    return next;
  }
  if (action.type === "assignTeam") {
    if (action.team >= next.settings.teamCount || action.team >= MAX_TEAMS) throw new EngineError("illegal", "Такой команды нет");
    const target = participant(next, action.userId);
    if (!target || target.left) throw new EngineError("illegal", "Такого игрока нет");
    target.team = action.team;
    return next;
  }
  // autoTeams: случайный порядок и раздача по кругу — размеры команд отличаются не больше чем на одного.
  const order = shuffle(
    next.participants.filter((p) => !p.left),
    ctx,
  );
  order.forEach((p, index) => {
    const target = participant(next, p.id);
    if (target) target.team = index % next.settings.teamCount;
  });
  return next;
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
    case "settings":
    case "assignTeam":
    case "autoTeams":
      return lobbyAction(state, action, actorId, ctx);
    default:
      return applyTurnAction(state, action, actorId, ctx);
  }
}

function applyTurnAction(state: State, action: GameAction, actorId: string, ctx: Ctx): State {
  const next = clone(state);
  const match = requireMatch(next);
  const { turn, card } = requireExplaining(next, ctx);
  const actor = requireActor(next, actorId);
  if (action.type === "explain") {
    if (turn.explainerId !== actorId) throw new EngineError("illegal", "Объясняет только объясняющий этого хода");
    if (ctx.nowMs - match.lastExplanationAt < LIMITS.explanationIntervalMs) throw new EngineError("rate", "Слишком часто — подождите мгновение");
    const text = requireText(action.text, LIMITS.explanationChars, "Объяснение");
    const hit = findForbidden(text, explanationDictionary(cardById(next, card.cardId)));
    if (hit) {
      const shown = hit.endsWith("*") ? `${hit.slice(0, -1)}…` : hit;
      throw new EngineError("illegal", `В объяснении запрещённое: «${shown}». Перефразируйте — таймер идёт`);
    }
    next.seq += 1;
    turn.explanations.push({ seq: next.seq, authorId: actorId, cardSeq: card.seq, text, at: ctx.nowMs });
    if (turn.explanations.length > LIMITS.feedHistory) turn.explanations = turn.explanations.slice(-LIMITS.feedHistory);
    match.lastExplanationAt = ctx.nowMs;
    return next;
  }
  if (action.type === "skip") {
    if (turn.explainerId !== actorId) throw new EngineError("illegal", "Пропустить карточку может только объясняющий");
    requireCardSeq(card, action.cardSeq);
    card.outcome = "skipped";
    turn.scoreDelta -= 1;
    const team = next.teams[turn.team];
    if (team) team.score -= 1;
    drawCard(next, ctx.nowMs);
    return next;
  }
  if (action.type === "guess") {
    if (actor.team !== turn.team) throw new EngineError("illegal", "Сейчас угадывает другая команда");
    if (turn.explainerId === actorId) throw new EngineError("illegal", "Объясняющий не угадывает");
    const last = match.lastGuessAt[actorId];
    if (last !== undefined && ctx.nowMs - last < LIMITS.guessIntervalMs) throw new EngineError("rate", "Не чаще одной попытки в 0,8 секунды");
    requireCardSeq(card, action.cardSeq);
    const text = requireText(action.text, LIMITS.guessChars, "Ответ");
    const source = cardById(next, card.cardId);
    const key = answerKey(text);
    const correct = [source.term, ...source.acceptedAnswers].some((answer) => answerKey(answer) === key);
    match.lastGuessAt[actorId] = ctx.nowMs;
    next.seq += 1;
    turn.guesses.push({ seq: next.seq, authorId: actorId, cardSeq: card.seq, text, correct, at: ctx.nowMs });
    if (turn.guesses.length > LIMITS.feedHistory) turn.guesses = turn.guesses.slice(-LIMITS.feedHistory);
    if (correct) {
      card.outcome = "guessed";
      card.guessedBy = actorId;
      turn.scoreDelta += 1;
      const team = next.teams[turn.team];
      if (team) team.score += 1;
      drawCard(next, ctx.nowMs);
    }
    return next;
  }
  throw new EngineError("illegal", "Неизвестное действие");
}

// ---------- присутствие ----------

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

function roleOf(state: State, viewerId: string, turn: Turn | null): MyRole {
  const me = participant(state, viewerId);
  if (!me || me.left) return "spectator";
  if (!turn || state.phase === "lobby" || state.phase === "finished" || state.phase === "cancelled") return "observer";
  if (turn.explainerId === viewerId) return "explainer";
  return me.team === turn.team ? "guesser" : "observer";
}

function revealedOf(state: State, turn: Turn, all: boolean): RevealedCard[] {
  return turn.cards
    .filter((c) => c.outcome !== "pending" && (all || c.outcome === "guessed"))
    .map((c) => ({ seq: c.seq, term: cardById(state, c.cardId).term, outcome: c.outcome, guessedBy: c.guessedBy }));
}

function summaryOf(state: State, turn: Turn): TurnSummary {
  return {
    number: turn.number,
    round: turn.round,
    team: turn.team,
    explainerId: turn.explainerId,
    scoreDelta: turn.scoreDelta,
    endedBy: turn.endedBy,
    cards: revealedOf(state, turn, true),
  };
}

function historyOf(state: State): TeamHistory[] {
  const turns = state.match?.turns ?? [];
  return state.teams.map((_, team) => {
    const cards = turns.filter((t) => t.team === team).flatMap((t) => t.cards);
    const toHistory = (c: TurnCard): HistoryCard => {
      const card = cardById(state, c.cardId);
      return { term: card.term, definition: card.definition, outcome: c.outcome, guessedBy: c.guessedBy };
    };
    return {
      team,
      accepted: cards.filter((c) => c.outcome === "guessed").map(toHistory),
      skipped: cards.filter((c) => c.outcome === "skipped").map(toHistory),
      expired: cards.filter((c) => c.outcome === "expired").map(toHistory),
    };
  });
}

export function project(state: State, viewerId: string): View {
  const me = participant(state, viewerId);
  const turn = state.phase === "lobby" ? null : currentTurn(state);
  const role = roleOf(state, viewerId, turn);
  const live = state.phase === "explaining" && turn !== null;
  const card = live ? currentCard(turn) : null;
  const seesGuesses = turn !== null && me !== undefined && !me.left && me.team === turn.team;
  const ended = state.phase === "turnResult" || state.phase === "finished" || state.phase === "cancelled";
  const finished = state.phase === "finished";
  const teamCount = state.settings.teamCount;
  return {
    kind: "rr-alias-view",
    sessionId: state.sessionId,
    phase: state.phase,
    viewerId,
    isParticipant: me !== undefined && !me.left,
    hostId: state.hostId,
    settings: { ...state.settings },
    phaseStartedAt: state.phaseStartedAt,
    deadline: state.deadline,
    participants: [...state.participants].sort(byJoin).map((p) => ({
      id: p.id,
      username: p.username,
      ready: p.ready,
      online: p.online,
      left: p.left,
      isHost: p.id === state.hostId,
      team: p.team,
    })),
    teams: Array.from({ length: teamCount }, (_, index) => {
      const meta = TEAMS[index] ?? TEAMS[0];
      return {
        index,
        name: meta.name,
        shape: meta.shape,
        color: meta.color,
        score: state.teams[index]?.score ?? 0,
        turnsPlayed: state.teams[index]?.turnsPlayed ?? 0,
        memberIds: state.participants.filter((p) => p.team === index).sort(byJoin).map((p) => p.id),
      };
    }),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    minCards: MIN_CARDS,
    contentCount: state.content.cards.length,
    startBlockers: state.phase === "lobby" ? startBlockers(state) : [],
    myTeam: me && !me.left ? me.team : null,
    myRole: role,
    round: turn?.round ?? null,
    turnNumber: turn?.number ?? null,
    totalTurns: totalTurns(state),
    activeTeam: turn?.team ?? null,
    explainerId: turn?.explainerId ?? null,
    cardSeq: card?.seq ?? null,
    card:
      card && role === "explainer"
        ? (() => {
            const source = cardById(state, card.cardId);
            return { seq: card.seq, term: source.term, forbidden: [...source.forbiddenForms, ...source.forbiddenPhrases], category: source.category };
          })()
        : null,
    explanations: turn ? turn.explanations.map((e) => ({ ...e })) : [],
    guesses: seesGuesses && turn ? turn.guesses.map((g) => ({ ...g })) : [],
    revealed: turn ? revealedOf(state, turn, ended) : [],
    lastTurn: turn && ended ? summaryOf(state, turn) : null,
    history: finished ? historyOf(state) : null,
    outcome: state.outcome ? { teamScores: [...state.outcome.teamScores], winnerTeams: [...state.outcome.winnerTeams], winnerIds: [...state.outcome.winnerIds] } : null,
    cancelReason: state.cancelReason,
  };
}
