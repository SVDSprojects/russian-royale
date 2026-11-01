import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Action, GameProps } from '../../../shared/games/jeopardy/types';
import { Anchor, Check, Compass, Flag, Trophy, Volume2, VolumeX } from 'lucide-react';
import { IslandArt } from './Art';
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
  return (
    <section
      className="rr-game-jeopardy rr-jeopardy-play"
      data-phase={view.phase}
      data-hidden={hidden}
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
            {sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
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
      <div className="rr-phase">
        <span className="jd-phase-icon">
          <Compass size={20} aria-hidden="true" />
        </span>
        <span className="jd-phase-label" aria-live="polite">
          {labels[view.phase]}
        </span>
        <span className="jd-round-counter">
          {view.phase !== 'lobby' && view.phase !== 'finished' ? `${view.round} / 25` : ''}
        </span>
        {view.deadline !== null && (
          <strong
            className="jd-timer"
            data-urgent={view.deadline - now < 6000}
            style={
              {
                '--jd-time': `${Math.min(100, Math.max(0, ((view.deadline - now) / Math.max(1, view.deadline - view.phaseStartedAt)) * 100))}%`,
              } as CSSProperties
            }
            aria-label={`Осталось ${Math.max(0, Math.ceil((view.deadline - now) / 1000))} секунд`}
          >
            <span>
              {Math.max(0, Math.ceil((view.deadline - now) / 1000))}
              <small> сек</small>
            </span>
          </strong>
        )}
      </div>
      {view.phase !== 'lobby' && view.phase !== 'finished' && (
        <div
          className="jd-route-progress"
          role="progressbar"
          aria-label="Открыто вопросов"
          aria-valuenow={view.board.filter((q) => q.closed).length}
          aria-valuemin={0}
          aria-valuemax={25}
        >
          <span style={{ width: `${view.board.filter((q) => q.closed).length * 4}%` }} />
        </div>
      )}
      {error && (
        <div role="alert" className="rr-error">
          {error}
        </div>
      )}
      {children}
      <footer className="rr-module-footer">
        <span>Архипелаг знаний · Учимся играя</span>
        <span>Своя игра · Каждое открытие приближает к победе</span>
      </footer>
    </section>
  );
}
export function Scoreboard({ props }: { props: GameProps }) {
  return (
    <aside className="rr-score">
      <div className="jd-crew-emblem" aria-hidden="true">
        <Anchor size={27} />
        <span>
          ЭКИПАЖ
          <br />
          <b>ROYALE</b>
        </span>
        <i>01</i>
      </div>
      <h2>
        На борту <span>{props.view.players.length}</span>
      </h2>
      {props.view.players.map((p, index) => (
        <div
          className={'rr-player ' + (p.id === props.currentUserId ? 'rr-self' : '')}
          key={p.id}
          data-online={p.online}
        >
          <span className="rr-avatar" data-color={index % 4}>
            {p.username.slice(0, 1)}
            <i />
          </span>
          <div>
            <b>
              {p.username}
              {p.id === props.currentUserId ? ' · вы' : ''}
            </b>
            <small>
              {p.id === props.view.hostId ? 'Ведущий · ' : ''}
              {p.online ? 'На связи' : 'Не в сети'}
              {p.teamId ? ` · ${props.view.teams.find((t) => t.id === p.teamId)?.name}` : ''}
            </small>
          </div>
          <strong>
            {p.score}
            <small>очков</small>
          </strong>
        </div>
      ))}
      <div className="jd-crew-note">
        <Compass size={17} aria-hidden="true" />
        <p>
          Лучшие открытия
          <br />
          <b>делаются вместе.</b>
        </p>
      </div>
    </aside>
  );
}
export function ResultPanel({ props }: { props: GameProps }) {
  const { act, busy, error } = useAction(props.send),
    r = props.view.result!;
  return (
    <div className="rr-result">
      <div className="jd-finish-art">
        <IslandArt index={4} winner={r.outcome !== 'cancelled'} />
        {r.outcome !== 'cancelled' && (
          <span className="jd-finish-medal">
            <Trophy size={24} aria-hidden="true" />
          </span>
        )}
      </div>
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
            {r.winnerUserIds.includes(p.userId) ? (
              <Trophy size={18} aria-hidden="true" />
            ) : (
              <Flag size={18} aria-hidden="true" />
            )}
            {props.view.players.find((x) => x.id === p.userId)?.username}
          </span>
          <b>{p.score}</b>
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
  return (
    <div className="rr-reveal">
      <p className="rr-kicker">
        <Check size={18} aria-hidden="true" /> ОТКРЫТИЕ СДЕЛАНО · РАЗБОР
      </p>
      <h2>{r.acceptedAnswers.join(' / ')}</h2>
      <p>{r.explanation}</p>
      <a href={r.ruleUrl} target="_blank" rel="noreferrer">
        Открыть правило ↗
      </a>
      {r.answers.map((a) => (
        <p className="jd-answer-result" data-correct={a.correct} key={a.userId}>
          <b>{props.view.players.find((p) => p.id === a.userId)?.username}:</b> {a.text}{' '}
          <span>{a.correct ? '✓ Верно' : 'Не в этот раз'}</span>
        </p>
      ))}
    </div>
  );
}
