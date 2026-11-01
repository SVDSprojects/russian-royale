import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Action, GameProps } from '../../../shared/games/roulette/types';
import { RouletteTrophy } from './StudioArt';
export function useAction(send: GameProps['send']) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function act(a: Action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await send(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие');
    } finally {
      setBusy(false);
    }
  }
  return { act, busy, error };
}
export function useClock(serverNowMs: number) {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const start = Date.now();
    setNow(serverNowMs);
    const id = setInterval(() => setNow(serverNowMs + Date.now() - start), 200);
    return () => clearInterval(id);
  }, [serverNowMs]);
  return now;
}
export function Frame({
  props,
  children,
  error = '',
  busy = false,
}: {
  props: GameProps;
  children: ReactNode;
  error?: string;
  busy?: boolean;
}) {
  const { view, connection, onExit, serverNowMs } = props;
  const now = useClock(serverNowMs);
  const [hidden, setHidden] = useState(false),
    [sound, setSound] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const phase = useRef(view.phase);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (phase.current !== view.phase && view.phase === 'reveal' && sound && !hidden && context.current) {
      const a = context.current,
        o = a.createOscillator(),
        gain = a.createGain();
      o.connect(gain);
      gain.connect(a.destination);
      gain.gain.setValueAtTime(0.035, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.15);
      o.frequency.value = 523.25;
      o.start();
      o.stop(a.currentTime + 0.16);
    }
    phase.current = view.phase;
  }, [view.phase, sound, hidden]);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  const labels: Record<string, string> = {
    lobby: 'Собираемся в дорогу',
    spin: 'Выбираем тему',
    question: 'Все отвечают',
    reveal: 'Разбираем ответ',
    roundResult: 'Итоги раунда',
    finished: 'Путешествие завершено',
    board: 'Капитан выбирает',
    reading: 'Читаем вопрос',
    buzz: 'Кто готов ответить?',
    answer: 'Сигнал принят',
  };
  const seconds = view.deadline === null ? 0 : Math.max(0, Math.ceil((view.deadline - now) / 1000));
  const remaining =
    view.deadline === null
      ? 1
      : Math.max(0, Math.min(1, (view.deadline - now) / Math.max(1, view.deadline - view.phaseStartedAt)));
  return (
    <section
      className="rr-game-roulette rr-roulette-client"
      data-hidden={hidden}
      data-phase={view.phase}
      aria-busy={busy}
    >
      <header className="rr-top">
        <span className="rr-module-brand">
          РУССКИЙ <b>ROYALE</b>
          <small>КЛУБ ЯЗЫКОВЫХ ИГР</small>
        </span>
        <div className="rr-top-actions">
          <button
            className="rr-quiet"
            onClick={() => {
              if (!context.current && 'AudioContext' in window) context.current = new AudioContext();
              void context.current?.resume();
              setSound(!sound);
            }}
            aria-pressed={sound}
          >
            {sound ? 'Звук вкл.' : 'Звук выкл.'}
          </button>
          <button className="rr-quiet" onClick={onExit}>
            Выйти
          </button>
        </div>
      </header>
      <div className="rr-status" role="status">
        <span className={'rr-dot ' + connection} />
        {connection === 'online'
          ? 'На связи'
          : connection === 'reconnecting'
            ? 'Восстанавливаем связь…'
            : 'Нет связи — возвращайтесь, ваше место сохранено'}
      </div>
      <div className="rr-phase" data-urgent={view.phase === 'question' && seconds <= 5}>
        <span className="rr-studio-phase-icon" aria-hidden="true">
          {view.phase === 'lobby' ? '↗' : view.phase === 'spin' ? '↻' : view.phase === 'finished' ? '★' : '✦'}
        </span>
        <span className="rr-studio-phase-title" aria-live="polite">
          {labels[view.phase]}
        </span>
        <span className="rr-studio-round-count">
          {view.phase !== 'lobby' && view.phase !== 'finished'
            ? `${view.round} / ${view.settings.mode === 'elimination' ? 12 : 10}`
            : ''}
        </span>
        {view.deadline !== null && (
          <strong
            className="rr-studio-clock"
            aria-label="Осталось секунд"
            style={{ '--rr-studio-time': `${remaining * 100}%` } as CSSProperties}
          >
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16" className="rr-studio-clock-track" />
              <circle
                cx="20"
                cy="20"
                r="16"
                className="rr-studio-clock-progress"
                pathLength="100"
                strokeDasharray={`${remaining * 100} 100`}
              />
              <path d="M20 10v10l6 4" />
            </svg>
            {seconds}
            <small> сек</small>
          </strong>
        )}
        {view.deadline !== null && (
          <div className="rr-studio-phase-progress" aria-hidden="true">
            <i style={{ transform: `scaleX(${remaining})` }} />
          </div>
        )}
      </div>
      {error && (
        <div role="alert" className="rr-error">
          {error}
        </div>
      )}
      {children}
      <footer className="rr-module-footer">
        <span>Карусель удачи · Учимся играя</span>
        <span>Одна попытка · Много открытий</span>
      </footer>
    </section>
  );
}
export function Scoreboard({ props }: { props: GameProps }) {
  return (
    <aside className="rr-score">
      <div className="rr-studio-score-heading">
        <p className="rr-kicker">ВАША КОМПАНИЯ</p>
        <h2>
          На борту <span>{props.view.players.length}</span>
        </h2>
      </div>
      {props.view.players.map((p, i) => (
        <div
          className={'rr-player ' + (p.id === props.currentUserId ? 'rr-self' : '')}
          key={p.id}
          data-player-color={i % 4}
          data-eliminated={
            props.view.phase !== 'lobby' && props.view.settings.mode === 'elimination' && p.lives === 0
          }
        >
          <span className="rr-avatar">{p.username.slice(0, 1)}</span>
          <div className="rr-studio-player-name">
            <b>
              {p.username}
              {p.id === props.currentUserId ? ' · вы' : ''}
            </b>
            <small>
              {p.id === props.view.hostId ? 'Ведущий · ' : ''}
              {!p.online
                ? 'Не в сети'
                : props.view.phase === 'lobby'
                  ? p.ready
                    ? 'Готов к игре'
                    : 'Собирается'
                  : props.view.phase === 'question' && props.view.answeredUserIds.includes(p.id)
                    ? 'Ответ принят ✓'
                    : 'На связи'}
              {p.teamId ? ` · ${props.view.teams.find((t) => t.id === p.teamId)?.name}` : ''}
            </small>
          </div>
          <strong key={`${p.id}-${p.score}-${p.lives}`}>
            {props.view.settings.mode === 'elimination' ? (
              <span
                aria-label={`${p.lives} билетов`}
                className={p.lives < 2 ? 'rr-tickets lost' : 'rr-tickets'}
              >
                {p.lives === 2 ? '▱ ▱' : p.lives === 1 ? '▱' : '✈'}
              </span>
            ) : (
              <>
                {p.score}
                <small>очков</small>
              </>
            )}
          </strong>
        </div>
      ))}
    </aside>
  );
}
export function ResultPanel({ props }: { props: GameProps }) {
  const { act, busy, error } = useAction(props.send),
    r = props.view.result!;
  return (
    <div className="rr-result" data-outcome={r.outcome}>
      <RouletteTrophy cancelled={r.outcome === 'cancelled'} />
      <p className="rr-kicker">ФИНИШ · РЕЗУЛЬТАТ СОХРАНЁН</p>
      <h1>
        {r.outcome === 'cancelled'
          ? 'До новой встречи'
          : r.outcome === 'draw'
            ? 'Победа на всех'
            : 'Есть победитель!'}
      </h1>
      <p>
        {r.outcome === 'cancelled'
          ? 'Партия отменена без победителей.'
          : r.winnerUserIds.map((id) => props.view.players.find((p) => p.id === id)?.username).join(', ')}
      </p>
      {r.scores.map((p) => (
        <div className="rr-final-score" key={p.userId} data-winner={r.winnerUserIds.includes(p.userId)}>
          <span>
            <i aria-hidden="true">
              {r.winnerUserIds.includes(p.userId)
                ? '★'
                : props.view.players.find((x) => x.id === p.userId)?.username.slice(0, 1)}
            </i>
            {props.view.players.find((x) => x.id === p.userId)?.username}
          </span>
          <b>
            {p.score}
            <small> очков</small>
          </b>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      {props.currentUserId === props.view.hostId ? (
        <button
          disabled={busy || props.connection !== 'online'}
          onClick={() => void act({ type: 'rematch' })}
        >
          Сыграть ещё раз ↗
        </button>
      ) : (
        <p>Ведущий может пригласить всех на реванш.</p>
      )}
    </div>
  );
}
export function Reveal({ props }: { props: GameProps }) {
  const r = props.view.reveal;
  if (!r) return null;
  const ownAnswer = r.answers.find((answer) => answer.userId === props.currentUserId);
  return (
    <div className="rr-reveal">
      <div className="rr-studio-verdict" data-correct={ownAnswer?.correct ?? false} role="status">
        <span aria-hidden="true">{ownAnswer?.correct ? '✓' : '→'}</span>
        <div>
          <b>
            {ownAnswer?.correct
              ? 'Точно в цель!'
              : ownAnswer
                ? 'Запомним на следующий раунд'
                : 'Разбираемся вместе'}
          </b>
          <small>{ownAnswer?.correct ? 'Ваш ответ верный' : 'Вот как работает это правило'}</small>
        </div>
      </div>
      <p className="rr-kicker">РАЗБОР</p>
      <h2>{r.acceptedAnswers.join(' / ')}</h2>
      <p>{r.explanation}</p>
      <a href={r.ruleUrl} target="_blank" rel="noreferrer">
        Открыть правило ↗
      </a>
      {r.answers.map((a) => (
        <p className="rr-studio-reveal-answer" data-correct={a.correct} key={a.userId}>
          <span className="rr-studio-reveal-marker" aria-label={a.correct ? 'Верно' : 'Неверно'}>
            {a.correct ? '✓' : '—'}
          </span>
          <span>
            <b>{props.view.players.find((p) => p.id === a.userId)?.username}</b>
            {a.text}
          </span>
        </p>
      ))}
    </div>
  );
}
