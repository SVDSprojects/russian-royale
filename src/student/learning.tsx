import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Heart,
  ImageIcon,
  Lightbulb,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import { api, useAuth } from '../api';
import {
  ArrowLink,
  Empty,
  ErrorNotice,
  go,
  json,
  Loading,
  message,
  Notice,
  PageHeader,
  useResource,
} from './common';
import type { Emotion, Exercise, Lesson, Progress, Rule, Teacher } from './models';

export function Rules() {
  const rules = useResource<Rule[]>('/rules', true),
    progress = useResource<Progress>('/progress', true),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('all'),
    [favorites, setFavorites] = useState(false);
  const categories = [...new Set((rules.data ?? []).map((r) => r.category))];
  const list = (rules.data ?? []).filter(
    (r) =>
      (category === 'all' || r.category === category) &&
      (!favorites || progress.data?.favorites.includes(r.id)) &&
      `${r.title} ${r.summary}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="ТВОЯ БАЗА ЗНАНИЙ"
        title="Справочник правил"
        description="Сложное становится понятным. Разбирайся в примерах и сразу проверяй себя."
      />
      <div className="rr-toolbar">
        <div className="rr-search">
          <Search size={18} />
          <input
            placeholder="Найти правило…"
            aria-label="Поиск правил"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={category} aria-label="Категория" onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Все категории</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          className={`rr-button secondary ${favorites ? 'selected' : ''}`}
          onClick={() => setFavorites(!favorites)}
          aria-pressed={favorites}
        >
          <Heart size={16} />
          {favorites ? 'Избранное' : 'Все правила'}
        </button>
      </div>
      <ErrorNotice text={rules.error || progress.error} />
      {rules.loading ? (
        <Loading />
      ) : list.length ? (
        <div className="rr-rule-grid">
          {list.map((r) => (
            <button className="rr-rule-card" key={r.id} onClick={() => go(`rules/${r.id}`)}>
              <div className="rr-rule-card-top">
                <span className="rr-subject-icon">
                  <BookOpen />
                </span>
                <span className="rr-pill purple">{r.category}</span>
                {progress.data?.learned.includes(r.id) && <CheckCircle2 size={19} className="rr-green" />}
              </div>
              <h2>{r.title}</h2>
              <p>{r.summary}</p>
              <div className="rr-rule-card-foot">
                <span>Уровень {r.difficulty} из 3</span>
                <span>
                  Разобраться
                  <ArrowRight size={16} />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={<BookOpen />}
          heading={rules.data?.length ? 'Правила не найдены' : 'Библиотека пока пуста'}
        >
          {rules.data?.length
            ? 'Измени запрос или фильтр.'
            : 'Редактор может добавить и опубликовать правила в админке.'}
        </Empty>
      )}
    </>
  );
}

export function RuleDetail({ id }: { id: string }) {
  const rule = useResource<Rule>(`/rules/${id}`, true),
    progress = useResource<Progress>('/progress', true),
    lessons = useResource<Lesson[]>('/lessons', true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const r = rule.data;
  const favorite = progress.data?.favorites.includes(id) ?? false,
    learned = progress.data?.learned.includes(id) ?? false;
  async function update(body: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(`/progress/${id}`, json('POST', body));
      await progress.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (rule.loading) return <Loading />;
  if (!r)
    return (
      <>
        <PageHeader title="Правило недоступно" back="rules" />
        <ErrorNotice text={rule.error} />
      </>
    );
  const lesson = lessons.data?.find((l) => l.ruleId === id);
  return (
    <>
      <PageHeader
        eyebrow={r.category}
        title={r.title}
        description={r.summary}
        back="rules"
        action={
          <button
            className={`rr-button secondary ${favorite ? 'selected' : ''}`}
            disabled={busy}
            aria-pressed={favorite}
            onClick={() => {
              void update({ favorite: !favorite });
            }}
          >
            <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
            {favorite ? 'В избранном' : 'В избранное'}
          </button>
        }
      />
      <ErrorNotice text={error || rule.error} />
      <div className="rr-rule-detail-grid">
        <article className="rr-panel rr-rule-body">
          <span className="rr-eyebrow">КАК ЭТО РАБОТАЕТ</span>
          <h2>Разберёмся в правиле</h2>
          <div className="rr-prose">{r.explanation}</div>
          {r.examples.length > 0 && (
            <>
              <h3>Смотри на примеры</h3>
              <div className="rr-examples">
                {r.examples.map((ex, i) => (
                  <div key={i}>
                    <Lightbulb size={18} />
                    <span>{ex}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {r.images?.map((image, i) => (
            <img
              className="rr-content-image"
              src={image}
              key={i}
              alt={`Иллюстрация к правилу ${i + 1}`}
              loading="lazy"
            />
          ))}
          {r.mistakes.length > 0 && (
            <div className="rr-mistake-box">
              <h3>На что обратить внимание</h3>
              {r.mistakes.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </div>
          )}
          <button
            className={`rr-button ${learned ? 'secondary' : 'primary'}`}
            disabled={busy}
            aria-pressed={learned}
            onClick={() => {
              void update({ learned: !learned });
            }}
          >
            <CheckCircle2 size={18} />
            {learned ? 'Изучено · отменить отметку' : 'Отметить как изученное'}
          </button>
        </article>
        <aside>
          <div className="rr-panel rr-study-side">
            <GraduationCap size={32} />
            <h3>С учительницей понятнее</h3>
            <p>
              {lesson
                ? 'Пройди этот материал шаг за шагом в интерактивном уроке.'
                : 'Практика ниже поможет проверить, как ты понял правило.'}
            </p>
            {lesson && (
              <button className="rr-button primary full" onClick={() => go(`lessons/${lesson.id}`)}>
                Открыть урок
                <ArrowRight size={16} />
              </button>
            )}
            <div className="rr-divider" />
            <div className="rr-study-meta">
              <span>Категория</span>
              <strong>{r.category}</strong>
              <span>Сложность</span>
              <strong>{r.difficulty} из 3</strong>
              <span>Упражнений</span>
              <strong>{r.exercises?.length ?? 0}</strong>
            </div>
          </div>
        </aside>
      </div>
      {(r.exercises?.length ?? 0) > 0 && (
        <section className="rr-practice-section">
          <div className="rr-section-heading">
            <div>
              <span className="rr-eyebrow">ЗАКРЕПЛЯЕМ</span>
              <h2>Теперь твоя очередь</h2>
            </div>
          </div>
          <div className="rr-exercise-grid">
            {r.exercises?.map((e) => (
              <ExerciseCard key={e.id} exercise={e} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function Lessons() {
  const lessons = useResource<Lesson[]>('/lessons', true),
    progress = useResource<Progress>('/progress', true),
    teacher = useResource<Teacher>('/teacher', true);
  return (
    <>
      <PageHeader
        eyebrow="НЕ ПРОСТО ПРОЧИТАТЬ. ПОНЯТЬ."
        title="Уроки с характером"
        description="Разбираем правила шаг за шагом — с примерами, практикой и поддержкой учительницы."
      />
      <ErrorNotice text={lessons.error || teacher.error} />
      {lessons.loading ? (
        <Loading />
      ) : lessons.data?.length ? (
        <div className="rr-lessons-grid">
          {lessons.data.map((lesson, i) => (
            <article className="rr-lesson-card" key={lesson.id}>
              <div className="rr-lesson-card-art">
                <span className="rr-lesson-number">УРОК {String(i + 1).padStart(2, '0')}</span>
                <img
                  src={teacher.data?.images.explaining ?? '/assets/teacher-explaining.png'}
                  alt={teacher.data?.name ?? 'Учительница'}
                  loading="lazy"
                />
                <span className="rr-star lesson-star">✦</span>
              </div>
              <div className="rr-lesson-card-body">
                <span className="rr-pill teal">
                  {progress.data?.completedLessons.includes(lesson.id) ? (
                    <>
                      <Check size={13} /> ПРОЙДЕНО
                    </>
                  ) : (
                    <>
                      <GraduationCap size={13} /> ИНТЕРАКТИВНЫЙ УРОК
                    </>
                  )}
                </span>
                <h2>{lesson.title}</h2>
                <p>{lesson.blocks.length} шагов: объяснения, примеры и самостоятельная практика.</p>
                <button className="rr-button primary full" onClick={() => go(`lessons/${lesson.id}`)}>
                  {progress.data?.completedLessons.includes(lesson.id) ? 'Пройти ещё раз' : 'Начать урок'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<GraduationCap />} heading="Первый урок ещё готовится">
          Как только редактор опубликует урок, он появится здесь.
        </Empty>
      )}
    </>
  );
}

type AnswerResult = { correct: boolean; answer: string; explanation: string; xpAwarded: number };
export function ExerciseCard({
  exercise,
  onResult,
  compact = false,
}: {
  exercise: Exercise;
  onResult?: (result: AnswerResult) => void;
  compact?: boolean;
}) {
  const { refresh } = useAuth(),
    [answer, setAnswer] = useState(''),
    [multi, setMulti] = useState<string[]>([]),
    [result, setResult] = useState<AnswerResult | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const next = await api<AnswerResult>(
        `/exercises/${exercise.id}/answer`,
        json('POST', { answer: exercise.type === 'multiple' ? multi.join(';') : answer }),
      );
      setResult(next);
      onResult?.(next);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const options = exercise.options ?? [];
  return (
    <form
      className={`rr-exercise-card ${compact ? 'compact' : ''} ${result?.correct ? 'answered' : ''}`}
      onSubmit={submit}
    >
      <span className="rr-eyebrow">ПРОВЕРЬ СЕБЯ</span>
      <h3>{exercise.prompt}</h3>
      {options.length > 0 ? (
        <div className="rr-answer-options">
          {options.map((option, i) => (
            <label
              key={i}
              className={`rr-answer-option ${(exercise.type === 'multiple' ? multi.includes(option) : answer === option) ? 'selected' : ''}`}
            >
              <input
                type={exercise.type === 'multiple' ? 'checkbox' : 'radio'}
                name={`exercise-${exercise.id}`}
                value={option}
                disabled={busy || result?.correct}
                checked={exercise.type === 'multiple' ? multi.includes(option) : answer === option}
                onChange={() => {
                  if (exercise.type === 'multiple')
                    setMulti((current) =>
                      current.includes(option) ? current.filter((v) => v !== option) : [...current, option],
                    );
                  else setAnswer(option);
                  setResult(null);
                }}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : (
        <label>
          Твой ответ
          <input
            aria-label="Твой ответ"
            value={answer}
            disabled={busy || result?.correct}
            autoComplete="off"
            required
            maxLength={2000}
            placeholder={exercise.type === 'letter' ? 'Вставь букву' : 'Введи ответ'}
            onChange={(e) => {
              setAnswer(e.target.value);
              setResult(null);
            }}
          />
        </label>
      )}
      <ErrorNotice text={error} />
      {result && (
        <div className={`rr-answer-feedback ${result.correct ? 'correct' : 'incorrect'}`} role="status">
          {result.correct ? <CheckCircle2 size={20} /> : <Lightbulb size={20} />}
          <div>
            <strong>{result.correct ? 'Всё верно!' : 'Разберёмся вместе'}</strong>
            {!result.correct && <p>Правильный ответ: {result.answer}</p>}
            <p>{result.explanation}</p>
            {result.xpAwarded > 0 && <span className="rr-earned-xp">+{result.xpAwarded} XP</span>}
          </div>
        </div>
      )}
      <button
        className={`rr-button ${result?.correct ? 'secondary' : 'primary'}`}
        disabled={busy || result?.correct || !(exercise.type === 'multiple' ? multi.length : answer.trim())}
      >
        {busy ? (
          'Проверяем…'
        ) : result?.correct ? (
          <>
            <Check size={17} /> Выполнено
          </>
        ) : (
          'Проверить ответ'
        )}
        {!result?.correct && <ArrowRight size={16} />}
      </button>
    </form>
  );
}

export function LessonPlayer({ id }: { id: string }) {
  const lesson = useResource<Lesson>(`/lessons/${id}`),
    teacher = useResource<Teacher>('/teacher'),
    rule = useResource<Rule>(lesson.data ? `/rules/${lesson.data.ruleId}` : null),
    { refresh } = useAuth();
  const [step, setStep] = useState(0),
    [emotion, setEmotion] = useState<Emotion>('explaining'),
    [answered, setAnswered] = useState<Record<string, boolean>>({}),
    [result, setResult] = useState<AnswerResult | null>(null),
    [finished, setFinished] = useState(false),
    [xp, setXp] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const l = lesson.data,
    b = l?.blocks[step];
  useEffect(() => {
    setResult(null);
    setEmotion(b?.emotion ?? 'explaining');
  }, [step, b?.emotion]);
  async function finish() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ xpAwarded: number }>(`/lessons/${id}/complete`, json('POST'));
      setXp(res.xpAwarded);
      setFinished(true);
      setEmotion('happy');
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (lesson.loading || teacher.loading) return <Loading />;
  if (!l)
    return (
      <>
        <PageHeader title="Урок недоступен" back="lessons" />
        <ErrorNotice text={lesson.error} />
      </>
    );
  const exercise = b?.exerciseId ? rule.data?.exercises?.find((ex) => ex.id === b.exerciseId) : null;
  const exerciseStep = b?.type === 'exercise' || b?.type === 'check';
  const canNext = !exerciseStep || !!(exercise && answered[exercise.id]);
  return (
    <>
      <PageHeader
        eyebrow="ИНТЕРАКТИВНЫЙ УРОК"
        title={l.title}
        back="lessons"
        action={
          <span className="rr-pill purple">
            {finished ? 'УРОК ПРОЙДЕН' : `ШАГ ${Math.min(step + 1, l.blocks.length)} ИЗ ${l.blocks.length}`}
          </span>
        }
      />
      <ErrorNotice text={error || teacher.error || rule.error} />
      <div className="rr-lesson-progress" aria-label="Прогресс урока">
        {l.blocks.map((block, i) => (
          <span key={block.id} className={finished || i <= step ? 'complete' : ''} />
        ))}
      </div>
      <section className="rr-lesson-stage">
        <div className={`rr-teacher-stage ${emotion}`}>
          <div className="rr-teacher-glow" />
          <img
            src={teacher.data?.images[emotion] ?? `/assets/teacher-${emotion}.png`}
            alt={`${teacher.data?.name ?? 'Учительница'}: ${emotion === 'happy' ? 'радуется' : emotion === 'strict' ? 'внимательно слушает' : 'объясняет'}`}
          />
          <div className="rr-teacher-name">
            <span className="rr-live-dot" />
            {teacher.data?.name ?? 'Твоя учительница'}
          </div>
          <span className="rr-teacher-floor" />
        </div>
        <div className="rr-lesson-content">
          {finished ? (
            <div className="rr-lesson-finish">
              <span className="rr-finish-icon">
                <TrophyIcon />
              </span>
              <span className="rr-eyebrow">ЕЩЁ ОДНА ПОБЕДА</span>
              <h2>Правило стало понятнее!</h2>
              <p>{teacher.data?.phrases.complete ?? 'Отличная работа. Продолжай в том же духе!'}</p>
              {xp > 0 && (
                <span className="rr-finish-xp">
                  <Sparkles size={20} /> +{xp} XP
                </span>
              )}
              <div className="rr-inline-actions">
                <button className="rr-button primary" onClick={() => go('lessons')}>
                  К другим урокам
                  <ArrowRight size={17} />
                </button>
                <button className="rr-button secondary" onClick={() => go(`rules/${l.ruleId}`)}>
                  Открыть правило
                </button>
              </div>
            </div>
          ) : !b ? (
            <div className="rr-dialogue-bubble">
              <h2>В уроке ещё нет шагов</h2>
              <p>Редактор может добавить блоки в конструкторе уроков.</p>
            </div>
          ) : (
            <>
              <div className={`rr-dialogue-bubble ${result?.correct ? 'happy' : ''}`}>
                <span className="rr-eyebrow">
                  {b.type === 'exercise' || b.type === 'check'
                    ? 'ТВОЯ ОЧЕРЕДЬ'
                    : b.type === 'example'
                      ? 'СМОТРИ НА ПРИМЕР'
                      : b.type === 'result'
                        ? 'ПОДВЕДЁМ ИТОГИ'
                        : 'РАЗБИРАЕМСЯ ВМЕСТЕ'}
                </span>
                <p className="rr-lesson-dialogue">
                  {result
                    ? result.correct
                      ? teacher.data?.phrases.correct
                      : teacher.data?.phrases.incorrect
                    : b.text || teacher.data?.phrases.intro}
                </p>
                {b.image && (
                  <img className="rr-content-image" src={b.image} alt={b.text ?? 'Учебная иллюстрация'} />
                )}
              </div>
              {exerciseStep &&
                (rule.loading ? (
                  <Loading />
                ) : exercise ? (
                  <ExerciseCard
                    key={exercise.id}
                    compact
                    exercise={exercise}
                    onResult={(r) => {
                      setResult(r);
                      setEmotion(r.correct ? 'happy' : 'surprised');
                      if (r.correct) setAnswered((prev) => ({ ...prev, [exercise.id]: true }));
                    }}
                  />
                ) : (
                  <Notice>
                    Упражнение не найдено или скрыто. Редактору нужно исправить этот блок урока.
                  </Notice>
                ))}
              {b.type === 'animation' && (
                <div className="rr-lesson-animation" aria-hidden="true">
                  <Sparkles />
                  <span>Новая мысль — новый уровень</span>
                  <Sparkles />
                </div>
              )}
              <div className="rr-lesson-navigation">
                <button
                  className="rr-button ghost"
                  disabled={step === 0 || busy}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={17} /> Назад
                </button>
                {step < l.blocks.length - 1 ? (
                  <button className="rr-button primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                    Далее
                    <ArrowRight size={17} />
                  </button>
                ) : (
                  <button
                    className="rr-button primary"
                    disabled={busy || !canNext}
                    onClick={() => {
                      void finish();
                    }}
                  >
                    {busy ? 'Сохраняем…' : 'Завершить урок'}
                    <CheckCircle2 size={17} />
                  </button>
                )}
              </div>
              {exerciseStep && !canNext && (
                <small className="rr-lesson-hint">
                  Ответь верно, чтобы перейти к следующему шагу. Можно попробовать ещё раз.
                </small>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
function TrophyIcon() {
  return <GraduationCap size={40} />;
}
