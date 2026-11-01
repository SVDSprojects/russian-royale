import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Heart, Timer, Trophy, Zap, RotateCcw } from 'lucide-react';
import { api, useAuth } from '../api';
import { ErrorNotice, go, json, message, PageHeader, useResource } from './common';
import type { Exercise } from './models';
import { ArcadeArt } from './ArcadeArt';

export const arcadeModes = [
  {
    id: 'review',
    name: 'Работа над ошибками',
    tag: 'ТВОЯ ПОДБОРКА',
    description: 'Вернись к заданиям, которые пока не получились. В своём темпе.',
    icon: RotateCcw,
  },
  {
    id: 'memory',
    name: 'Пары правил',
    tag: 'МЕМОРИ',
    description: 'Раскрой карточки. Соедини правило с примером. Запомни поле.',
    icon: Trophy,
  },
  {
    id: 'sprint',
    name: 'Блиц',
    tag: '60 СЕКУНД',
    description: 'Собирай серию правильных ответов, пока идёт отсчёт.',
    icon: Timer,
  },
  {
    id: 'survival',
    name: 'Три жизни',
    tag: 'НА ВЫЖИВАНИЕ',
    description: 'Три ошибки — конец забега. Сколько правил ты выдержишь?',
    icon: Heart,
  },
  {
    id: 'practice',
    name: 'Маршрут знаний',
    tag: 'БЕЗ СПЕШКИ',
    description: 'До двенадцати испытаний. Разбери ошибки и доберись до финиша.',
    icon: Zap,
  },
];
export function ArcadeCards({ search = '' }: { search?: string }) {
  return (
    <div className="arcade-modes">
      {arcadeModes
        .filter((m) => `${m.name} ${m.description}`.toLowerCase().includes(search.toLowerCase()))
        .map((m) => (
          <button key={m.id} className={`arcade-mode ${m.id}`} onClick={() => go('arcade/' + m.id)}>
            <ArcadeArt mode={m.id} />
            <div className="arcade-card-copy">
              <span className="arcade-card-tag">
                <m.icon size={13} />
                {m.tag}
              </span>
              <h3>{m.name}</h3>
              <p>{m.description}</p>
              <strong className="arcade-card-cta">
                {m.id === 'review' ? 'Разобрать ошибки' : 'Начать забег'} <ArrowRight size={18} />
              </strong>
            </div>
          </button>
        ))}
    </div>
  );
}
type Result = { correct: boolean; answer: string; explanation: string; xpAwarded: number };
type TrainingExercise = Exercise & { ruleTitle: string; needsReview: boolean };
function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function Arcade({ mode }: { mode: string }) {
  const selected = arcadeModes.find((m) => m.id === mode) || arcadeModes.find((m) => m.id === 'practice')!;
  const bank = useResource<{ exercises: TrainingExercise[] }>('/training');
  const [topic, setTopic] = useState('all'),
    [difficulty, setDifficulty] = useState('all');
  const topics = [...new Map((bank.data?.exercises || []).map((e) => [e.ruleId, e.ruleTitle])).entries()];
  const filter = (e: TrainingExercise) =>
    (mode !== 'review' || e.needsReview) &&
    (topic === 'all' || e.ruleId === topic) &&
    (difficulty === 'all' || e.difficulty === Number(difficulty));
  const available = (bank.data?.exercises || []).filter(filter).length;
  const { refresh } = useAuth();
  const [deck, setDeck] = useState<TrainingExercise[]>([]),
    [phase, setPhase] = useState<'ready' | 'loading' | 'playing' | 'done'>('ready');
  const [index, setIndex] = useState(0),
    [correct, setCorrect] = useState(0),
    [lives, setLives] = useState(3),
    [seconds, setSeconds] = useState(60),
    [answer, setAnswer] = useState(''),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [xp, setXp] = useState(0);
  const deadline = useRef(0),
    locked = useRef(false),
    [mistakes, setMistakes] = useState<
      { prompt: string; answer: string; explanation: string; ruleId: string }[]
    >([]);
  useEffect(() => {
    if (phase !== 'playing' || mode !== 'sprint') return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining && !locked.current) setPhase('done');
    }, 200);
    return () => clearInterval(timer);
  }, [phase, mode]);
  async function start() {
    setPhase('loading');
    setError('');
    try {
      const fresh = await api<{ exercises: TrainingExercise[] }>('/training');
      bank.setData(fresh);
      const questions = shuffle(fresh.exercises.filter(filter));
      if (!questions.length)
        throw Error(
          mode === 'review'
            ? 'В этой подборке больше нет ошибок. Попробуй другую тему или обычную тренировку.'
            : 'Для этих настроек пока нет заданий. Выбери другую тему или сложность.',
        );
      setDeck(mode === 'practice' || mode === 'review' ? questions.slice(0, 12) : questions);
      setIndex(0);
      setCorrect(0);
      setLives(3);
      setSeconds(60);
      setAnswer('');
      setResult(null);
      setMistakes([]);
      setXp(0);
      deadline.current = Date.now() + 60000;
      setPhase('playing');
    } catch (e) {
      setError(message(e));
      setPhase('ready');
    }
  }
  const exercise = deck[index];
  async function submit() {
    if (locked.current || !answer.trim() || result) return;
    if (mode === 'sprint' && Date.now() >= deadline.current) {
      setPhase('done');
      return;
    }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await api<Result>(`/exercises/${exercise.id}/answer`, json('POST', { answer }));
      setResult(next);
      setXp((v) => v + next.xpAwarded);
      if (next.correct) setCorrect((v) => v + 1);
      else {
        setLives((v) => v - 1);
        setMistakes((v) => [
          ...v,
          {
            prompt: exercise.prompt,
            answer: next.answer,
            explanation: next.explanation,
            ruleId: exercise.ruleId,
          },
        ]);
      }
      void refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function next() {
    if (
      index + 1 >= deck.length ||
      (mode === 'survival' && lives <= 0) ||
      (mode === 'sprint' && Date.now() >= deadline.current)
    ) {
      setPhase('done');
      return;
    }
    setIndex((i) => i + 1);
    setResult(null);
    setAnswer('');
  }
  return (
    <>
      <PageHeader
        eyebrow="СОЛО • ТРЕНИРОВОЧНАЯ АРКАДА"
        title={selected.name}
        description={selected.description}
      />
      <ErrorNotice text={error || bank.error} />
      {(phase === 'ready' || phase === 'loading') && (
        <section className="arcade-stage">
          <div className="arcade-orbit">
            <selected.icon size={80} />
            <span>А</span>
            <span>Я</span>
          </div>
          <h2>{mode === 'review' ? 'Сложное станет понятным' : 'Твой ход. Твои правила.'}</h2>
          <p>
            {mode === 'review'
              ? 'Здесь задания, в которых твой последний ответ был неверным. Решишь правильно — задание уйдёт из подборки. Ошибки сохраняются в аккаунте, в том числе после уроков.'
              : 'Выбери тему и сложность или доверься случайной подборке. За первое правильное решение задания получишь 5 XP.'}
          </p>
          <div className="arcade-filters">
            <label>
              Тема
              <select
                aria-label="Тема тренировки"
                value={topic}
                disabled={phase === 'loading'}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="all">Все темы</option>
                {topics.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Сложность
              <select
                aria-label="Сложность тренировки"
                value={difficulty}
                disabled={phase === 'loading'}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="all">Любая сложность</option>
                <option value="1">1 · Разминка</option>
                <option value="2">2 · Уверенный шаг</option>
                <option value="3">3 · Вызов</option>
              </select>
            </label>
          </div>
          <p role="status">{bank.loading ? 'Загружаем задания…' : `Подходит заданий: ${available}`}</p>
          {!bank.loading && !bank.error && available === 0 && (
            <p>
              {mode === 'review'
                ? 'Ошибок для повторения нет. Можно отправляться за новыми знаниями!'
                : 'Измени фильтры, чтобы подобрать задания.'}
            </p>
          )}
          <button
            className="rr-button primary"
            disabled={phase === 'loading' || bank.loading || !available}
            onClick={start}
          >
            {phase === 'loading' ? 'Собираем испытания…' : 'Поехали'} <ArrowRight size={18} />
          </button>
          {mode === 'review' && (
            <button className="rr-button secondary" onClick={() => go('arcade/practice')}>
              Обычная тренировка
            </button>
          )}
        </section>
      )}
      {phase === 'playing' && exercise && (
        <section className="arcade-stage">
          <div className="arcade-hud">
            <span>
              <Zap /> {correct} верных
            </span>
            <span>
              {mode === 'sprint' ? (
                <>
                  <Timer /> {seconds} сек.
                </>
              ) : mode === 'survival' ? (
                <>
                  <Heart /> {lives} / 3
                </>
              ) : (
                `${index + 1} / ${deck.length}`
              )}
            </span>
            <span>+{xp} XP</span>
          </div>
          <div className="arcade-track">
            <i style={{ width: `${(index / deck.length) * 100}%` }} />
          </div>
          <p className="rr-eyebrow">
            ИСПЫТАНИЕ {index + 1} · УРОВЕНЬ {exercise.difficulty}
          </p>
          <p className="arcade-topic">{exercise.ruleTitle}</p>
          <h2 className="arcade-question">{exercise.prompt}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="arcade-options">
              {exercise.options.map((option) => (
                <button
                  type="button"
                  key={option}
                  aria-pressed={answer === option}
                  disabled={busy || !!result}
                  className={`${answer === option ? 'chosen' : ''} ${result && option === result.answer ? 'correct-option' : ''} ${result && !result.correct && answer === option ? 'wrong-option' : ''}`}
                  onClick={() => setAnswer(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            {!exercise.options.length && (
              <input
                aria-label="Ваш ответ"
                value={answer}
                disabled={busy || !!result}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}
            {!result && (
              <button className="rr-button primary" disabled={busy || !answer.trim()}>
                {busy ? 'Проверяем…' : 'Зафиксировать ответ'}
              </button>
            )}
          </form>
          {result && (
            <div className={`arcade-feedback ${result.correct ? 'yes' : 'no'}`} role="status">
              <h3>{result.correct ? 'Попадание!' : 'Разбираем промах'}</h3>
              <p>
                {!result.correct && `Ответ: ${result.answer}. `}
                {result.explanation}
              </p>
              <button className="rr-button primary" onClick={next}>
                Дальше <ArrowRight size={18} />
              </button>
            </div>
          )}
        </section>
      )}
      {phase === 'done' && (
        <section className="arcade-stage">
          <Trophy size={64} />
          <p className="rr-eyebrow">ЗАБЕГ ЗАВЕРШЁН</p>
          <h2>{correct} правильных ответов</h2>
          <p>
            Получено {xp} XP. Точность:{' '}
            {correct + mistakes.length ? Math.round((correct / (correct + mistakes.length)) * 100) : 0}%.
          </p>
          <p>
            Ответов: {correct + mistakes.length}.{' '}
            {mistakes.length
              ? 'Разбери объяснения ниже и закрепи трудные темы.'
              : 'Отличный повод попробовать следующую сложность.'}
          </p>
          <button className="rr-button primary" onClick={start}>
            <RotateCcw size={18} /> Ещё забег
          </button>
          <button
            className="rr-button secondary"
            onClick={() => {
              setPhase('ready');
              void bank.reload();
            }}
          >
            Изменить подборку
          </button>
          <button className="rr-button secondary" onClick={() => go('games')}>
            К играм
          </button>
          {mistakes.length > 0 && (
            <div className="arcade-review">
              <h3>Вернуться к сложному</h3>
              {mistakes.map((m, i) => (
                <article key={i}>
                  <strong>
                    {m.prompt} → {m.answer}
                  </strong>
                  <p>{m.explanation}</p>
                  <button className="rr-button secondary" onClick={() => go('rules/' + m.ruleId)}>
                    Открыть правило
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
