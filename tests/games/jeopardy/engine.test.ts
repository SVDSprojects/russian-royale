import { describe, it, expect } from 'vitest';
import {
  create,
  apply,
  advance,
  project,
  result,
  nextDeadline,
  joinParticipant,
  leaveParticipant,
} from '../../../server/games/jeopardy/engine';
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
} from '../../../shared/games/jeopardy/types';
import raw from '../../../server/games/jeopardy/initial-content.json' with { type: 'json' };
const content = ContentSchema.parse(raw);
const context = (nowMs = 100000): Context => ({ nowMs, randomInt: () => 0 });
function lobby(n = 2, settings = defaultSettings): State {
  return create({
    sessionId: 'session_1',
    hostId: 'u1',
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
  for (const p of s.players) s = apply(s, { type: 'ready', ready: true }, p.id, context());
  return apply(s, { type: 'start' }, 'u1', context());
}
function atDeadline(s: State): State {
  return advance(s, context(s.deadline!));
}
function until(s: State, phase: State['phase']): State {
  for (let i = 0; i < 300 && s.phase !== phase; i++) s = atDeadline(s);
  return s;
}
describe('Контракт и общие правила', () => {
  it('строгие runtime-валидаторы не принимают лишние поля и неверные типы', () => {
    expect(() => SettingsSchema.parse({ ...defaultSettings, admin: true })).toThrow();
    expect(() => ActionSchema.parse({ type: 'ready', ready: 'true' })).toThrow();
    expect(() => ActionSchema.parse({ type: 'answer', text: 'a', score: 100 })).toThrow();
    expect(() => ContentSchema.parse({ ...content, secret: true })).toThrow();
    expect(() => StateSchema.parse({ ...lobby(), deadline: Infinity })).toThrow();
    expect(() => ViewSchema.parse({ ...project(lobby(), 'u1'), state: {} })).toThrow();
    expect(() => ResultSchema.parse({})).toThrow();
  });
  it('допускает минимальное и максимальное число игроков', () => {
    expect(start(2).players).toHaveLength(2);
    expect(start(16).players).toHaveLength(16);
    expect(() => lobby(17)).toThrow();
    expect(() => lobby(0)).toThrow();
  });
  it('нельзя стартовать одному, без готовности, чужим ведущим или повторно', () => {
    let s = lobby(1);
    s = apply(s, { type: 'ready', ready: true }, 'u1', context());
    expect(() => apply(s, { type: 'start' }, 'u1', context())).toThrow();
    expect(() => apply(lobby(), { type: 'start' }, 'u1', context())).toThrow();
    expect(() => apply(start(), { type: 'start' }, 'u2', context())).toThrow();
    expect(() => apply(start(), { type: 'start' }, 'u1', context())).toThrow();
  });
  it('пустой набор и неопубликованные карточки блокируют старт', () => {
    let s = lobby();
    s.contentSnapshot.questions = [];
    s.players.forEach((p) => (p.ready = true));
    expect(() => apply(s, { type: 'start' }, 'u1', context())).toThrow();
    expect(
      contentIssues({
        ...content,
        questions: content.questions.map((q) => ({ ...q, status: 'draft' })),
      }),
    ).not.toHaveLength(0);
  });
  it('вход не мутируется; JSON round-trip восстанавливает тот же View', () => {
    const s = start(),
      before = JSON.stringify(s);
    const a = advance(s, context(s.deadline!));
    expect(JSON.stringify(s)).toBe(before);
    expect(project(JSON.parse(JSON.stringify(a)) as State, 'u1')).toEqual(project(a, 'u1'));
  });
  it('догоняет просроченные фазы без сдвига дедлайна от перезагрузки', () => {
    let stepped = start();
    const target = 100000 + 120000;
    while (stepped.deadline !== null && stepped.deadline <= target) stepped = atDeadline(stepped);
    expect(advance(start(), context(target))).toEqual(stepped);
  });
  it('полная партия по таймаутам заканчивается ничьей и стабильным результатом', () => {
    let s = start();
    for (let i = 0; i < 200 && s.phase !== 'finished'; i++) s = atDeadline(s);
    expect(s.phase).toBe('finished');
    expect(result(s)?.outcome).toBe('draw');
    expect(result(s)?.winnerUserIds).toEqual(['u1', 'u2']);
    expect(result(s)).toEqual(result(s));
    expect(nextDeadline(s)).toBeNull();
  });
  it('чужой участник не получает View и не может действовать', () => {
    expect(() => project(start(), 'outsider')).toThrow();
    expect(() => apply(start(), { type: 'cancel' }, 'outsider', context())).toThrow();
  });
  it('отмена только ведущим; после отмены действия запрещены', () => {
    const s = start();
    expect(() => apply(s, { type: 'cancel' }, 'u2', context())).toThrow();
    const c = apply(s, { type: 'cancel' }, 'u1', context());
    expect(result(c)?.outcome).toBe('cancelled');
    expect(result(c)?.winnerUserIds).toEqual([]);
    expect(() => apply(c, { type: 'ready', ready: true }, 'u1', context())).toThrow();
  });
  it('ведущий передаёт управление ровно после 45 секунд отсутствия', () => {
    const s = lobby();
    s.players[0]!.online = false;
    s.players[0]!.offlineSince = 100000;
    expect(advance(s, context(144999)).hostId).toBe('u1');
    expect(nextDeadline(s)).toBe(145000);
    expect(advance(s, context(145000)).hostId).toBe('u2');
  });
  it('все отсутствуют 10 минут — отмена; завершившаяся раньше партия не отменяется', () => {
    const s = lobby();
    s.players.forEach((p) => {
      p.online = false;
      p.offlineSince = 100000;
    });
    expect(advance(s, context(699999)).phase).toBe('lobby');
    expect(result(advance(s, context(700000)))?.outcome).toBe('cancelled');
    const active = start();
    active.players.forEach((p) => {
      p.online = false;
      p.offlineSince = 100000;
    });
    const end = advance(active, context(10000000));
    expect(result(end)?.outcome).toBe('cancelled');
  });
  it('выход из лобби и пустой состав, активная партия сохраняет место', () => {
    let s = lobby();
    s = leaveParticipant(s, 'u1', context());
    expect(s.hostId).toBe('u2');
    s = leaveParticipant(s, 'u2', context());
    expect(result(s)?.outcome).toBe('cancelled');
    const active = leaveParticipant(start(), 'u1', context());
    expect(active.players).toHaveLength(2);
    expect(active.players[0]!.online).toBe(false);
  });
  it('новые игроки не входят после старта', () => {
    expect(joinParticipant(lobby(), { id: 'u3', username: 'Третий' }).players).toHaveLength(3);
    expect(() => joinParticipant(start(), { id: 'u3', username: 'Третий' })).toThrow();
  });
  it('ё/е, регистр, пробелы и пунктуация сохраняются без явной нормализации', () => {
    const exact = {
      trim: false,
      caseFold: false,
      collapseSpaces: false,
      foldYo: false,
      stripPunctuation: false,
    };
    expect(normalize(' Ёж! ', exact)).toBe(' Ёж! ');
    expect(
      isCorrect(
        {
          ...content.questions[0]!,
          acceptedAnswers: ['Ёж!'],
          normalization: exact,
        },
        'еж',
      ),
    ).toBe(false);
    expect(
      normalize(' ЁЖ! ', {
        trim: true,
        caseFold: true,
        collapseSpaces: true,
        foldYo: true,
        stripPunctuation: true,
      }),
    ).toBe('еж');
  });
  it('серверный снимок не зависит от последующего редактирования источника', () => {
    const source = structuredClone(content);
    const s = create({
      sessionId: 's',
      hostId: 'u1',
      participants: [{ id: 'u1', username: 'А' }],
      settings: defaultSettings,
      contentSnapshot: source,
      ctx: context(),
    });
    source.questions[0]!.acceptedAnswers = ['изменено'];
    expect(s.contentSnapshot.questions[0]!.acceptedAnswers).toEqual(content.questions[0]!.acceptedAnswers);
  });
});

function reading(): State {
  const s = start(),
    team = s.teams.find((t) => t.id === s.chooserTeamId)!;
  return apply(s, { type: 'select', questionId: 'glasnye_1' }, team.captainId, context());
}
function buzz(): State {
  return atDeadline(reading());
}

describe('Очередность и пропуск', () => {
  it('первый ответ у первой команды и 20 секунд', () => {
    const s = buzz();
    expect(s.phase).toBe('answer');
    expect(s.answererId).toBe(s.teams[0]!.captainId);
    expect(s.deadline! - s.phaseStartedAt).toBe(20000);
  });
  it('пропуск без штрафа отдаёт ход следующей команде', () => {
    let s = buzz();
    s = apply(s, { type: 'pass' }, s.answererId!, context(s.phaseStartedAt));
    expect(s.teams.every((t) => t.score === 0)).toBe(true);
    expect(s.answererId).toBe(s.teams[1]!.captainId);
    s = apply(s, { type: 'pass' }, s.answererId!, context(s.phaseStartedAt));
    expect(s.phase).toBe('reveal');
    expect(s.teams.every((t) => t.score === 0)).toBe(true);
  });
  it('чужая команда не может пропустить или ответить', () => {
    const s = buzz();
    expect(() => apply(s, { type: 'pass' }, 'u2', context(s.phaseStartedAt))).toThrow();
    expect(() => apply(s, { type: 'answer', text: 'и' }, 'u2', context(s.phaseStartedAt))).toThrow();
  });
  it('ошибка штрафует только отвечающую команду', () => {
    let s = buzz();
    s = apply(s, { type: 'answer', text: 'ошибка' }, s.answererId!, context(s.phaseStartedAt));
    expect(s.teams[0]!.score).toBe(-100);
    expect(s.answererId).toBe(s.teams[1]!.captainId);
    expect(s.teams[1]!.score).toBe(0);
  });
  it('правильный ответ и полный результат не раскрывают ответ заранее', () => {
    let s = buzz();
    expect(JSON.stringify(project(s, 'u2'))).not.toContain('acceptedAnswers');
    s = apply(s, { type: 'answer', text: 'и' }, s.answererId!, context(s.phaseStartedAt));
    expect(s.phase).toBe('reveal');
    expect(s.teams[0]!.score).toBe(100);
    s = advance(s, context(10000000));
    expect(s.phase).toBe('finished');
    expect(s.used).toHaveLength(25);
  });
  it('дальнейший ответ выбирается через серверный randomInt', () => {
    let s = buzz();
    s = apply(s, { type: 'pass' }, s.answererId!, context(s.phaseStartedAt));
    s = apply(s, { type: 'pass' }, s.answererId!, context(s.phaseStartedAt));
    s = atDeadline(s);
    const team = s.teams.find((t) => t.id === s.chooserTeamId)!;
    const q = content.questions.find((q) => !s.used.includes(q.id))!;
    s = apply(s, { type: 'select', questionId: q.id }, team.captainId, context(s.phaseStartedAt));
    s = advance(s, { nowMs: s.deadline!, randomInt: () => 1 });
    expect(s.answererId).toBe(s.teams[1]!.captainId);
  });
});
