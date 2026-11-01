import {
  ActionSchema,
  SettingsSchema,
  ContentSchema,
  StateSchema,
  ViewSchema,
  Id,
  GameError,
  EmptyRosterError,
  CancelledMatchError,
  contentIssues,
  isCorrect,
  type State,
  type Action,
  type Context,
  type CreateInput,
  type View,
  type Result,
} from "../../../shared/games/roulette/types";
const clone = (s: State): State => structuredClone(s);
function fail(message: string): never {
  throw new GameError(422, message);
}
function choose<T>(xs: T[], ctx: Context): T {
  if (!xs.length) fail("Недостаточно опубликованных заданий");
  const n = ctx.randomInt(xs.length);
  if (!Number.isInteger(n) || n < 0 || n >= xs.length)
    throw new Error("Некорректный генератор");
  return xs[n]!;
}
export function create(input: CreateInput): State {
  const settings = SettingsSchema.parse(input.settings),
    contentSnapshot = ContentSchema.parse(input.contentSnapshot);
  if (!input.participants.length) throw new EmptyRosterError();
  if (
    input.participants.length > 16 ||
    new Set(input.participants.map((p) => p.id)).size !==
      input.participants.length
  )
    fail("Допустимо от 1 до 16 уникальных участников в лобби");
  if (!input.participants.some((p) => p.id === input.hostId))
    fail("Ведущий должен быть участником");
  const s = StateSchema.parse({
    sessionId: Id.parse(input.sessionId),
    hostId: input.hostId,
    phase: "lobby",
    phaseStartedAt: input.ctx.nowMs,
    deadline: null,
    settings,
    contentSnapshot,
    players: input.participants.map((p) => ({
      ...p,
      ready: false,
      online: true,
      offlineSince: null,
      score: 0,
      correct: 0,
      lives: 2,
      teamId: null,
    })),
    teams: [],
    round: 0,
    currentId: null,
    used: [],
    answers: [],
    roundPlayers: [],
    sectorIndex: 0,
    sectorIds: [],
    chooserTeamId: null,
    answererId: null,
    blockedTeams: [],
    chat: [],
    flags: [],
    finishedResult: null,
  });
  afterRoster(s);
  return s;
}
function finish(s: State, winners: string[], cancelled = false) {
  s.phase = "finished";
  s.deadline = null;
  s.finishedResult = {
    sessionId: s.sessionId,
    winnerUserIds: winners,
    scores: s.players.map((p) => ({ userId: p.id, score: p.score })),
    outcome: cancelled ? "cancelled" : winners.length > 1 ? "draw" : "win",
  };
}
function presence(s: State, now: number) {
  if (s.phase === "finished") return;
  const online = s.players.filter((p) => p.online);
  if (!s.players.length) {
    finish(s, [], true);
    return;
  }
  if (
    !online.length &&
    s.players.every((p) => p.offlineSince !== null) &&
    now >= Math.max(...s.players.map((p) => p.offlineSince!)) + 600000
  ) {
    finish(s, [], true);
    return;
  }
  const host = s.players.find((p) => p.id === s.hostId);
  if (
    online.length &&
    (!host ||
      (!host.online &&
        host.offlineSince !== null &&
        now >= host.offlineSince + 45000))
  )
    s.hostId = online[0]!.id;
  for (const t of s.teams) {
    const captain = s.players.find((p) => p.id === t.captainId);
    const available = online.filter((p) => p.teamId === t.id);
    if (
      available.length &&
      (!captain ||
        (!captain.online &&
          captain.offlineSince !== null &&
          now >= captain.offlineSince + 45000))
    )
      t.captainId = available[0]!.id;
  }
}
export function nextDeadline(s: State): number | null {
  if (s.phase === "finished") return null;
  const dates: number[] = [];
  if (s.deadline !== null) dates.push(s.deadline);
  const online = s.players.filter((p) => p.online);
  if (
    !online.length &&
    s.players.length &&
    s.players.every((p) => p.offlineSince !== null)
  )
    dates.push(Math.max(...s.players.map((p) => p.offlineSince!)) + 600000);
  for (const id of [s.hostId, ...s.teams.map((t) => t.captainId)]) {
    const p = s.players.find((p) => p.id === id);
    if (
      p &&
      !p.online &&
      p.offlineSince !== null &&
      online.some((o) => id === s.hostId || o.teamId === p.teamId)
    )
      dates.push(p.offlineSince + 45000);
  }
  return dates.length ? Math.min(...dates) : null;
}
export function result(s: State): Result | null {
  return s.finishedResult ? structuredClone(s.finishedResult) : null;
}
export function project(s: State, viewerId: string): View {
  const player = s.players.find((p) => p.id === viewerId);
  if (!player) throw new GameError(404, "Комната недоступна");
  const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId);
  const revealed =
    s.phase === "reveal" || s.phase === "roundResult" || s.phase === "finished";
  const show = s.phase === "question" || revealed;
  return ViewSchema.parse({
    sessionId: s.sessionId,
    hostId: s.hostId,
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    deadline: s.deadline,
    settings: s.settings,
    players: s.players,
    teams: s.teams,
    round: s.round,
    categories: s.contentSnapshot.categories,
    board: [],
    question:
      q && show
        ? {
            id: q.id,
            prompt: q.prompt,
            options: q.options,
            difficulty: q.difficulty,
            categoryId: q.categoryId,
            cost: q.cost,
          }
        : null,
    reveal:
      q && revealed
        ? {
            acceptedAnswers: q.acceptedAnswers,
            explanation: q.explanation,
            ruleId: q.ruleId,
            ruleUrl: q.ruleUrl,
            answers: s.answers.map((a) => ({
              userId: a.userId,
              text: a.text,
              correct: isCorrect(q, a.text),
            })),
          }
        : null,
    answeredUserIds: s.answers.map((a) => a.userId),
    sectorIndex: s.sectorIndex,
    sectorIds: s.sectorIds,
    chooserTeamId: s.chooserTeamId,
    answererId: s.answererId,
    blockedTeams: s.blockedTeams,
    chat: s.chat.filter((m) => m.teamId === player.teamId),
    flags: s.flags,
    result: result(s),
    contentIssues: s.phase === "lobby" ? contentIssues(s.contentSnapshot) : [],
  });
}
export function apply(
  state: State,
  raw: Action,
  actorId: string,
  ctx: Context,
): State {
  const action = ActionSchema.parse(raw),
    s = advance(state, ctx),
    p = s.players.find((p) => p.id === actorId);
  if (!p) throw new GameError(404, "Комната недоступна");
  if (s.finishedResult?.outcome === "cancelled")
    throw new CancelledMatchError();
  if (s.phase === "finished") fail("Партия завершена");
  if (
    ["answer", "buzz", "select"].includes(action.type) &&
    (s.phase !== state.phase ||
      s.phaseStartedAt !== state.phaseStartedAt ||
      s.round !== state.round)
  )
    fail("Время этого действия истекло");
  if (action.type === "cancel") {
    if (actorId !== s.hostId)
      throw new GameError(403, "Только ведущий может отменить партию");
    finish(s, [], true);
    return s;
  }
  if (action.type === "ready") {
    if (s.phase !== "lobby") fail("Готовность меняется только в лобби");
    p.ready = action.ready;
    return s;
  }
  if (action.type === "start") {
    if (actorId !== s.hostId)
      throw new GameError(403, "Начать может только ведущий");
    if (
      s.phase !== "lobby" ||
      s.players.length < 2 ||
      !s.players.every((p) => p.ready && p.online)
    )
      fail("Нужны 2–16 подключённых и готовых участников");
    const issues = contentIssues(s.contentSnapshot);
    if (issues.length) fail(issues.join(". "));
    spin(s, ctx.nowMs, ctx);
    return s;
  }

  if (action.type === "answer") {
    if (s.phase !== "question" || !s.roundPlayers.includes(actorId))
      fail("Сейчас нельзя отвечать");
    if (s.answers.some((a) => a.userId === actorId)) fail("Ответ уже принят");
    s.answers.push({
      userId: actorId,
      text: action.text,
      receivedAt: ctx.nowMs,
    });
    if (s.answers.length === s.roundPlayers.length) reveal(s, ctx.nowMs);
    return s;
  }

  fail("Действие сейчас недоступно");
}
export function advance(state: State, ctx: Context): State {
  const s = clone(state);
  const cancellationAt =
    s.players.length &&
    !s.players.some((p) => p.online) &&
    s.players.every((p) => p.offlineSince !== null)
      ? Math.max(...s.players.map((p) => p.offlineSince!)) + 600000
      : null;
  const limit =
    cancellationAt !== null
      ? Math.min(ctx.nowMs, cancellationAt - 1)
      : ctx.nowMs;
  for (
    let transitions = 0;
    s.deadline !== null && limit >= s.deadline;
    transitions++
  ) {
    if (transitions >= 512) throw new Error("Превышен предел переходов");
    const at = s.deadline;
    if (s.phase === "spin") {
      s.phase = "question";
      s.phaseStartedAt = at;
      s.deadline = at + duration(s);
    } else if (s.phase === "question") reveal(s, at);
    else if (s.phase === "reveal") {
      s.phase = "roundResult";
      s.phaseStartedAt = at;
      s.deadline = at + 2000;
    } else if (s.phase === "roundResult") {
      const alive = s.players.filter((p) => p.lives > 0);
      if (s.settings.mode === "elimination" && alive.length === 0)
        finish(s, s.roundPlayers);
      else if (s.settings.mode === "elimination" && alive.length === 1)
        finish(s, [alive[0]!.id]);
      else if (s.round >= (s.settings.mode === "elimination" ? 12 : 10)) {
        const ranked = s.players.map((p) => ({
          id: p.id,
          key:
            s.settings.mode === "elimination"
              ? p.lives * 100 + p.correct
              : p.score,
        }));
        const best = Math.max(...ranked.map((p) => p.key));
        finish(
          s,
          ranked.filter((p) => p.key === best).map((p) => p.id),
        );
      } else spin(s, at, ctx);
    } else throw new Error("Неизвестный этап с дедлайном");
  }
  presence(s, ctx.nowMs);
  return s;
}

function level(s: State): 1 | 2 | 3 {
  return s.round <= 3 ? 1 : s.round <= 6 ? 2 : 3;
}
function duration(s: State): number {
  return s.settings.durations[level(s) - 1]!;
}
function spin(s: State, at: number, ctx: Context) {
  s.round++;
  const eligible = s.contentSnapshot.questions.filter(
    (q) => q.status === "published" && q.difficulty === level(s),
  );
  let pool = eligible.filter((q) => !s.used.includes(q.id));
  if (!pool.length) {
    s.used = s.used.filter((id) => !eligible.some((q) => q.id === id));
    pool = eligible;
  }
  const cats = s.contentSnapshot.categories.filter((c) =>
    pool.some((q) => q.categoryId === c.id),
  );
  const cat = choose(cats, ctx),
    q = choose(
      pool.filter((q) => q.categoryId === cat.id),
      ctx,
    );
  s.currentId = q.id;
  s.used.push(q.id);
  s.sectorIds = cats.map((c) => c.id);
  s.sectorIndex = cats.findIndex((c) => c.id === cat.id);
  s.roundPlayers = s.players
    .filter((p) => s.settings.mode !== "elimination" || p.lives > 0)
    .map((p) => p.id);
  s.answers = [];
  s.phase = "spin";
  s.phaseStartedAt = at;
  s.deadline = at + 2000;
}
function reveal(s: State, at: number) {
  const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
  const end = s.deadline!;
  for (const id of s.roundPlayers) {
    const p = s.players.find((p) => p.id === id)!,
      a = s.answers.find((a) => a.userId === id);
    const correct = !!a && isCorrect(q, a.text);
    if (correct) {
      p.correct++;
      if (s.settings.mode !== "elimination")
        p.score +=
          100 * level(s) +
          (s.settings.mode === "speed"
            ? Math.floor((50 * Math.max(0, end - a!.receivedAt)) / duration(s))
            : 0);
    } else if (s.settings.mode === "elimination") p.lives--;
  }
  s.phase = "reveal";
  s.phaseStartedAt = at;
  s.deadline = at + 6000;
}
function afterRoster(_s: State): void {}

/** Trusted server roster operation; never accepted as a client Action. */
export function joinParticipant(
  state: State,
  participant: { id: string; username: string },
): State {
  const s = clone(state);
  if (s.phase !== "lobby") fail("Партия уже началась");
  if (s.players.some((p) => p.id === participant.id)) return s;
  if (s.players.length >= 16) fail("Комната заполнена");
  s.players.push({
    id: Id.parse(participant.id),
    username: participant.username,
    ready: false,
    online: true,
    offlineSince: null,
    score: 0,
    correct: 0,
    lives: 2,
    teamId: null,
  });
  afterRoster(s);
  s.players.forEach((p) => (p.ready = false));
  return StateSchema.parse(s);
}
export function leaveParticipant(
  state: State,
  id: string,
  ctx: Context,
): State {
  const s = clone(state),
    p = s.players.find((p) => p.id === id);
  if (!p) throw new GameError(404, "Комната недоступна");
  if (s.phase === "lobby") {
    s.players = s.players.filter((p) => p.id !== id);
    if (s.hostId === id && s.players.length) s.hostId = s.players[0]!.id;
    afterRoster(s);
    s.players.forEach((p) => (p.ready = false));
  } else {
    p.online = false;
    p.offlineSince = ctx.nowMs;
  }
  return advance(s, ctx);
}
