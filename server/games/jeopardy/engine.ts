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
} from '../../../shared/games/jeopardy/types';
const clone = (s: State): State => structuredClone(s);
function fail(message: string): never {
  throw new GameError(422, message);
}
function choose<T>(xs: T[], ctx: Context): T {
  if (!xs.length) fail('Недостаточно опубликованных заданий');
  const n = ctx.randomInt(xs.length);
  if (!Number.isInteger(n) || n < 0 || n >= xs.length) throw new Error('Некорректный генератор');
  return xs[n]!;
}
export function create(input: CreateInput): State {
  const settings = SettingsSchema.parse(input.settings),
    contentSnapshot = ContentSchema.parse(input.contentSnapshot);
  if (!input.participants.length) throw new EmptyRosterError();
  if (
    input.participants.length > 16 ||
    new Set(input.participants.map((p) => p.id)).size !== input.participants.length
  )
    fail('Допустимо от 1 до 16 уникальных участников в лобби');
  if (!input.participants.some((p) => p.id === input.hostId)) fail('Ведущий должен быть участником');
  const s = StateSchema.parse({
    sessionId: Id.parse(input.sessionId),
    hostId: input.hostId,
    phase: 'lobby',
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
  s.phase = 'finished';
  s.deadline = null;
  s.finishedResult = {
    sessionId: s.sessionId,
    winnerUserIds: winners,
    scores: s.players.map((p) => ({ userId: p.id, score: p.score })),
    outcome: cancelled ? 'cancelled' : winners.length > 1 ? 'draw' : 'win',
  };
}
function presence(s: State, now: number) {
  if (s.phase === 'finished') return;
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
    (!host || (!host.online && host.offlineSince !== null && now >= host.offlineSince + 45000))
  )
    s.hostId = online[0]!.id;
  for (const t of s.teams) {
    const captain = s.players.find((p) => p.id === t.captainId);
    const available = online.filter((p) => p.teamId === t.id);
    if (
      available.length &&
      (!captain || (!captain.online && captain.offlineSince !== null && now >= captain.offlineSince + 45000))
    )
      t.captainId = available[0]!.id;
  }
}
export function nextDeadline(s: State): number | null {
  if (s.phase === 'finished') return null;
  const dates: number[] = [];
  if (s.deadline !== null) dates.push(s.deadline);
  const online = s.players.filter((p) => p.online);
  if (!online.length && s.players.length && s.players.every((p) => p.offlineSince !== null))
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
  if (!player) throw new GameError(404, 'Комната недоступна');
  const q = s.contentSnapshot.questions.find((q) => q.id === s.currentId);
  const revealed = s.phase === 'reveal' || s.phase === 'finished';
  const show = ['reading', 'buzz', 'answer', 'reveal', 'finished'].includes(s.phase);
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
    board: s.contentSnapshot.questions
      .filter((q) => q.status === 'published')
      .map((q) => ({
        id: q.id,
        categoryId: q.categoryId,
        cost: q.cost,
        closed: s.used.includes(q.id),
      })),
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
    contentIssues: s.phase === 'lobby' ? contentIssues(s.contentSnapshot) : [],
  });
}
export function apply(state: State, raw: Action, actorId: string, ctx: Context): State {
  const action = ActionSchema.parse(raw),
    s = advance(state, ctx),
    p = s.players.find((p) => p.id === actorId);
  if (!p) throw new GameError(404, 'Комната недоступна');
  if (s.finishedResult?.outcome === 'cancelled') throw new CancelledMatchError();
  if (s.phase === 'finished') fail('Партия завершена');
  if (
    ['answer', 'buzz', 'select'].includes(action.type) &&
    (s.phase !== state.phase || s.phaseStartedAt !== state.phaseStartedAt || s.round !== state.round)
  )
    fail('Время этого действия истекло');
  if (action.type === 'cancel') {
    if (actorId !== s.hostId) throw new GameError(403, 'Только ведущий может отменить партию');
    finish(s, [], true);
    return s;
  }
  if (action.type === 'ready') {
    if (s.phase !== 'lobby') fail('Готовность меняется только в лобби');
    p.ready = action.ready;
    return s;
  }
  if (action.type === 'start') {
    if (actorId !== s.hostId) throw new GameError(403, 'Начать может только ведущий');
    if (s.phase !== 'lobby' || s.players.length < 2 || !s.players.every((p) => p.ready && p.online))
      fail('Нужны 2–16 подключённых и готовых участников');
    const issues = contentIssues(s.contentSnapshot);
    if (issues.length) fail(issues.join('. '));
    if (s.teams.length < 2 || s.teams.length > 4 || s.players.some((p) => !p.teamId))
      fail('Нужно от двух до четырёх команд');
    s.chooserTeamId = choose(s.teams, ctx).id;
    s.phase = 'board';
    s.phaseStartedAt = ctx.nowMs;
    s.deadline = ctx.nowMs + 20000;
    return s;
  }

  if (action.type === 'team') {
    if (
      s.phase !== 'lobby' ||
      !Array.from({ length: s.settings.teamCount }, (_, i) => `t${i + 1}`).includes(action.teamId)
    )
      fail('Команду можно выбрать только в лобби');
    p.teamId = action.teamId;
    afterRoster(s);
    s.players.forEach((p) => (p.ready = false));
    return s;
  }
  if (action.type === 'captain') {
    const team = s.teams.find((t) => t.id === p.teamId),
      candidate = s.players.find((x) => x.id === action.userId);
    if (s.phase !== 'lobby' || !team || candidate?.teamId !== p.teamId)
      fail('Выберите капитана своей команды в лобби');
    team.captainId = candidate.id;
    s.players.filter((x) => x.teamId === p.teamId).forEach((x) => (x.ready = false));
    return s;
  }
  if (action.type === 'chat') {
    if (!p.teamId) fail('Сначала выберите команду');
    s.chat.push({
      id: `m_${s.chat.length ? Number(s.chat[s.chat.length - 1]!.id.slice(2)) + 1 : 1}`,
      userId: actorId,
      teamId: p.teamId,
      text: action.text,
      at: ctx.nowMs,
    });
    s.chat = s.chat.slice(-100);
    return s;
  }
  if (action.type === 'select') {
    const team = s.teams.find((t) => t.id === s.chooserTeamId);
    if (s.phase !== 'board' || team?.captainId !== actorId)
      fail('Ячейку выбирает капитан команды, которой принадлежит ход');
    select(s, action.questionId, ctx.nowMs);
    return s;
  }
  if (action.type === 'pass') {
    const current = s.players.find((x) => x.id === s.answererId);
    if (s.phase !== 'answer' || !p.teamId || p.teamId !== current?.teamId)
      fail('Сейчас отвечает другая команда');
    s.blockedTeams.push(p.teamId!);
    chooseAnswerer(s, ctx.nowMs, ctx);
    return s;
  }
  if (action.type === 'buzz') {
    if (s.phase !== 'buzz' || !p.teamId || s.blockedTeams.includes(p.teamId))
      fail('Сигнал сейчас недоступен');
    s.answererId = actorId;
    s.phase = 'answer';
    s.phaseStartedAt = ctx.nowMs;
    s.deadline = ctx.nowMs + 20000;
    return s;
  }
  if (action.type === 'answer') {
    if (s.phase !== 'answer' || s.answererId !== actorId) fail('Отвечает участник, первым подавший сигнал');
    s.answers.push({
      userId: actorId,
      text: action.text,
      receivedAt: ctx.nowMs,
    });
    judge(
      s,
      isCorrect(
        s.contentSnapshot.questions.find((q) => q.id === s.currentId)!,
        action.text,
      ),
      ctx.nowMs,
      ctx,
    );
    return s;
  }

  fail('Действие сейчас недоступно');
}
export function advance(state: State, ctx: Context): State {
  const s = clone(state);
  const cancellationAt =
    s.players.length && !s.players.some((p) => p.online) && s.players.every((p) => p.offlineSince !== null)
      ? Math.max(...s.players.map((p) => p.offlineSince!)) + 600000
      : null;
  const limit = cancellationAt !== null ? Math.min(ctx.nowMs, cancellationAt - 1) : ctx.nowMs;
  for (let transitions = 0; s.deadline !== null && limit >= s.deadline; transitions++) {
    if (transitions >= 512) throw new Error('Превышен предел переходов');
    const at = s.deadline;
    if (s.phase === 'board') {
      const available = s.contentSnapshot.questions.filter(
        (q) => q.status === 'published' && !s.used.includes(q.id),
      );
      available.sort(
        (a, b) =>
          a.cost - b.cost ||
          s.contentSnapshot.categories.findIndex((c) => c.id === a.categoryId) -
            s.contentSnapshot.categories.findIndex((c) => c.id === b.categoryId),
      );
      if (!available.length) complete(s);
      else select(s, available[0]!.id, at);
    } else if (s.phase === 'reading') {
      chooseAnswerer(s, at, ctx);
    } else if (s.phase === 'buzz') reveal(s, at);
    else if (s.phase === 'answer') judge(s, false, at, ctx);
    else if (s.phase === 'reveal') {
      if (s.used.length === 25) complete(s);
      else {
        s.phase = 'board';
        s.phaseStartedAt = at;
        s.deadline = at + 20000;
        s.currentId = null;
        s.answererId = null;
        s.answers = [];
      }
    } else throw new Error('Неизвестный этап с дедлайном');
  }
  presence(s, ctx.nowMs);
  return s;
}

function select(s: State, id: string, at: number) {
  if (
    s.used.includes(id) ||
    !s.contentSnapshot.questions.some((q) => q.id === id && q.status === 'published')
  )
    fail('Ячейка закрыта или отсутствует');
  s.currentId = id;
  s.used.push(id);
  s.round++;
  s.answers = [];
  s.blockedTeams = [];
  s.answererId = null;
  s.phase = 'reading';
  s.phaseStartedAt = at;
  s.deadline = at + 5000;
}
function judge(s: State, correct: boolean, at: number, ctx: Context) {
  const p = s.players.find((p) => p.id === s.answererId)!,
    team = s.teams.find((t) => t.id === p.teamId)!,
    q = s.contentSnapshot.questions.find((q) => q.id === s.currentId)!;
  team.score += correct ? q.cost : -q.cost;
  s.players.filter((p) => p.teamId === team.id).forEach((p) => (p.score = team.score));
  if (correct) {
    p.correct++;
    s.chooserTeamId = team.id;
    s.flags.push({ questionId: q.id, teamId: team.id });
    reveal(s, at);
  } else {
    s.blockedTeams.push(team.id);
    s.answererId = null;
    if (s.blockedTeams.length === s.teams.length) reveal(s, at);
    else {
      chooseAnswerer(s, at, ctx);
    }
  }
}
function reveal(s: State, at: number) {
  s.phase = 'reveal';
  s.phaseStartedAt = at;
  s.deadline = at + 6000;
}
function complete(s: State) {
  const best = Math.max(...s.teams.map((t) => t.score));
  const teams = s.teams.filter((t) => t.score === best).map((t) => t.id);
  finish(
    s,
    s.players.filter((p) => teams.includes(p.teamId!)).map((p) => p.id),
  );
  if (s.finishedResult) s.finishedResult.outcome = teams.length > 1 ? 'draw' : 'win';
}
function afterRoster(s: State) {
  for (const p of s.players)
    if (!p.teamId) p.teamId = `t${(s.players.indexOf(p) % s.settings.teamCount) + 1}`;
  const ids = [...new Set(s.players.map((p) => p.teamId!))];
  s.teams = ids.map((id) => {
    const old = s.teams.find((t) => t.id === id);
    const members = s.players.filter((p) => p.teamId === id);
    return {
      id,
      name: `Команда ${id.slice(1)}`,
      captainId: members.some((p) => p.id === old?.captainId) ? old!.captainId : members[0]!.id,
      score: 0,
    };
  });
}

/** Trusted server roster operation; never accepted as a client Action. */
export function joinParticipant(state: State, participant: { id: string; username: string }): State {
  const s = clone(state);
  if (s.phase !== 'lobby') fail('Партия уже началась');
  if (s.players.some((p) => p.id === participant.id)) return s;
  if (s.players.length >= 16) fail('Комната заполнена');
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
export function leaveParticipant(state: State, id: string, ctx: Context): State {
  const s = clone(state),
    p = s.players.find((p) => p.id === id);
  if (!p) throw new GameError(404, 'Комната недоступна');
  if (s.phase === 'lobby') {
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

function chooseAnswerer(s: State, at: number, ctx: Context) {
  const teams = s.teams.filter(
    (t) => !s.blockedTeams.includes(t.id) && s.players.some((p) => p.teamId === t.id && p.online),
  );
  if (!teams.length) {
    reveal(s, at);
    return;
  }
  const t = s.round === 1 ? teams[0]! : teams[ctx.randomInt(teams.length)]!;
  const player =
    s.players.find((p) => p.id === t.captainId && p.online) ||
    s.players.find((p) => p.teamId === t.id && p.online)!;
  s.answererId = player.id;
  s.phase = 'answer';
  s.phaseStartedAt = at;
  s.deadline = at + 20000;
}
