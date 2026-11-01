import { useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Gamepad2,
  HelpCircle,
  Hourglass,
  Link2,
  LogOut,
  MessageCircle,
  Play,
  RotateCcw,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Vote,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api, useAuth } from '../api';
import {
  Avatar,
  ConnectionContext,
  CopyButton,
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
import type { Message, RoomView } from './models';

const phaseName = {
  lobby: 'Сбор игроков',
  discussion: 'Обсуждение',
  voting: 'Голосование',
  guess: 'Последний шанс',
  finished: 'Результаты',
};
export function RoomPage({ id }: { id: string }) {
  const { user, refresh } = useAuth(),
    connected = useContext(ConnectionContext),
    [joined, setJoined] = useState(false),
    [joinError, setJoinError] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [showRole, setShowRole] = useState(false),
    [voteTarget, setVoteTarget] = useState(''),
    [guess, setGuess] = useState(''),
    [now, setNow] = useState(Date.now());
  const room = useResource<RoomView>(joined ? `/rooms/${id}` : null, true);
  const offset = useRef(0);
  useEffect(() => {
    let active = true;
    api<RoomView>(`/rooms/${id}/join`, json('POST'))
      .then(() => {
        if (active) setJoined(true);
      })
      .catch((e) => {
        if (active) setJoinError(message(e));
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (room.data) offset.current = room.data.serverNow - Date.now();
  }, [room.data?.serverNow]);
  useEffect(() => {
    setShowRole(false);
    setVoteTarget('');
    setGuess('');
  }, [room.data?.sessionId]);
  useEffect(() => {
    if (room.data?.phase === 'finished') void refresh();
  }, [room.data?.phase]);
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(`/rooms/${id}/${path}`, json('POST', body));
      await room.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    setError('');
    try {
      await api(`/rooms/${id}/leave`, json('POST'));
      go(room.data ? `servers/${room.data.serverId}` : 'servers');
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  if (joinError)
    return (
      <>
        <PageHeader title="Не получилось войти в комнату" back="servers" />
        <ErrorNotice text={joinError} />
        <Notice>Если игра уже идёт, дождись её завершения. Новые игроки присоединяются в лобби.</Notice>
      </>
    );
  if (!joined || room.loading) return <Loading />;
  const r = room.data;
  if (!r)
    return (
      <>
        <PageHeader title="Комната недоступна" back="servers" />
        <ErrorNotice text={room.error} />
      </>
    );
  const host = user?.id === r.hostId,
    seconds = r.deadline ? Math.max(0, Math.ceil((r.deadline - (now + offset.current)) / 1000)) : 0,
    ready = r.players.filter((p) => p.ready).length,
    canStart = r.players.length >= 3 && ready === r.players.length,
    active = r.phase !== 'lobby' && r.phase !== 'finished';
  const spy = r.me.role === 'spy';
  const winner = r.result?.winner === 'spy' ? 'Победил шпион' : 'Победили знатоки';
  return (
    <>
      <PageHeader
        eyebrow={`ШПИОН · РАУНД ${r.round || 1}`}
        title={r.name}
        description="Наблюдай, задавай вопросы и доверяй своей интуиции."
        back={`servers/${r.serverId}`}
        action={
          <div className="rr-room-header-actions">
            <span className={`rr-connection ${connected && !room.error ? 'online' : ''}`}>
              {connected && !room.error ? <Wifi size={15} /> : <WifiOff size={15} />}{' '}
              {connected && !room.error ? 'На связи' : 'Переподключаемся…'}
            </span>
            <button
              className="rr-button ghost small"
              disabled={busy}
              onClick={() => {
                void leave();
              }}
            >
              <LogOut size={16} /> Выйти
            </button>
          </div>
        }
      />
      <ErrorNotice text={error || room.error} />
      <div className="rr-round-track">
        {[
          { phase: 'lobby', title: 'Сбор игроков', icon: Users },
          { phase: 'discussion', title: 'Обсуждение', icon: MessageCircle },
          { phase: 'voting', title: 'Голосование', icon: Vote },
          { phase: 'finished', title: 'Результаты', icon: Trophy },
        ].map((item, i) => {
          const phases = ['lobby', 'discussion', 'voting', 'guess', 'finished'];
          const current = r.phase === item.phase || (r.phase === 'guess' && item.phase === 'voting');
          return (
            <div
              key={item.phase}
              className={`${current ? 'active' : ''} ${phases.indexOf(r.phase) > phases.indexOf(item.phase) ? 'past' : ''}`}
            >
              <span>
                {phases.indexOf(r.phase) > phases.indexOf(item.phase) ? (
                  <Check size={15} />
                ) : (
                  <item.icon size={16} />
                )}
              </span>
              <strong>{item.title}</strong>
              {i < 3 && <ChevronRight size={15} />}
            </div>
          );
        })}
      </div>
      <div className="rr-room-layout">
        <section className="rr-room-main">
          <div className="rr-game-state">
            <div className="rr-game-state-heading">
              <div>
                <span className="rr-eyebrow">
                  {r.phase === 'lobby'
                    ? 'ВАША КОМАНДА СОБИРАЕТСЯ'
                    : r.phase === 'finished'
                      ? 'ПАРТИЯ ЗАВЕРШЕНА'
                      : 'СЕКРЕТЫ ОСТАЮТСЯ МЕЖДУ НАМИ'}
                </span>
                <h2>{phaseName[r.phase]}</h2>
              </div>
              {active && (
                <div
                  className={`rr-game-timer ${seconds <= 15 ? 'urgent' : ''}`}
                  aria-label="Осталось времени"
                >
                  <Clock3 size={19} />
                  <strong>
                    {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                    {String(seconds % 60).padStart(2, '0')}
                  </strong>
                </div>
              )}
            </div>
            {r.phase === 'lobby' && (
              <div className="rr-lobby-center">
                <div className="rr-lobby-emblem">
                  <Eye size={50} strokeWidth={1.5} />
                  <span>?</span>
                </div>
                <h3>
                  Всем найдётся роль.
                  <br />
                  Но не всем — тема.
                </h3>
                <p>Один игрок станет шпионом. Остальные получат секретную тему и попробуют его вычислить.</p>
                <div className="rr-lobby-settings">
                  <span>
                    <Users size={15} />
                    {r.players.length} / {r.maxPlayers} игроков
                  </span>
                  <span>
                    <Clock3 size={15} />
                    {Math.floor(r.discussionSeconds / 60)}:{String(r.discussionSeconds % 60).padStart(2, '0')}{' '}
                    на обсуждение
                  </span>
                </div>
                <div className="rr-inline-actions">
                  <button
                    className={`rr-button ${r.me.ready ? 'secondary' : 'primary'}`}
                    disabled={busy}
                    onClick={() => {
                      void action('ready', { ready: !r.me.ready });
                    }}
                  >
                    <CheckCircle2 size={17} />
                    {r.me.ready ? 'Я готов · отменить' : 'Я готов играть'}
                  </button>
                  {host && (
                    <button
                      className="rr-button light"
                      disabled={busy || !canStart}
                      onClick={() => {
                        void action('start');
                      }}
                    >
                      <Play size={17} /> Начать игру
                    </button>
                  )}
                </div>
                <small className="rr-lobby-wait">
                  {r.players.length < 3
                    ? `Нужны ещё ${3 - r.players.length} игрок${3 - r.players.length === 1 ? '' : 'а'}. Пригласи друзей на сервер.`
                    : ready < r.players.length
                      ? `Готовы ${ready} из ${r.players.length}. Ждём остальных.`
                      : host
                        ? 'Все готовы. Можно начинать!'
                        : 'Все готовы. Ждём запуска ведущим.'}
                </small>
              </div>
            )}
            {active && (
              <>
                <div className={`rr-secret-card ${spy ? 'spy' : 'citizen'} ${showRole ? 'revealed' : ''}`}>
                  <div className="rr-secret-icon">{spy ? <Eye size={28} /> : <ShieldCheck size={28} />}</div>
                  <div>
                    <span className="rr-eyebrow">ТОЛЬКО ДЛЯ ТЕБЯ</span>
                    {showRole ? (
                      <>
                        <h3>{spy ? 'Ты — шпион' : 'Ты — знаток'}</h3>
                        <p>{spy ? `Категория: ${r.me.category ?? '—'}` : r.me.topic}</p>
                        <small>
                          {spy
                            ? 'Не выдавай себя. Попробуй понять, что обсуждают остальные.'
                            : 'Не произноси название темы. Проверяй, понимают ли её другие.'}
                        </small>
                      </>
                    ) : (
                      <>
                        <h3>Твоя секретная роль</h3>
                        <p>Посмотри, когда никто не заглядывает в экран.</p>
                      </>
                    )}
                  </div>
                  <button
                    className="rr-icon-button"
                    aria-label={showRole ? 'Скрыть роль' : 'Показать роль'}
                    onClick={() => setShowRole(!showRole)}
                  >
                    {showRole ? <EyeOff size={21} /> : <Eye size={21} />}
                  </button>
                </div>
                {r.phase === 'discussion' && (
                  <div className="rr-phase-content">
                    <span className="rr-phase-icon">
                      <MessageCircle />
                    </span>
                    <h3>Самое интересное — между строк</h3>
                    <p>
                      Задавайте друг другу вопросы по теме. Отвечайте достаточно понятно для знатоков, но не
                      раскрывайте правило шпиону.
                    </p>
                    <Notice>
                      Общайтесь в чате комнаты, голосом рядом или в своём звонке. Встроенной голосовой связи
                      пока нет.
                    </Notice>
                    {host && (
                      <button
                        className="rr-button secondary"
                        disabled={busy}
                        onClick={() => {
                          void action('advance');
                        }}
                      >
                        <Vote size={17} /> Перейти к голосованию
                      </button>
                    )}
                    <small>Когда таймер закончится, голосование начнётся автоматически.</small>
                  </div>
                )}
                {r.phase === 'voting' && (
                  <div className="rr-phase-content">
                    <h3>{r.me.voted ? 'Твой голос принят' : 'Кто из вас шпион?'}</h3>
                    <p>
                      {r.me.voted
                        ? 'Повторно проголосовать нельзя. Дождись решения команды.'
                        : 'Выбери подозреваемого и подтверди голос. Изменить решение после отправки нельзя.'}
                    </p>
                    <div className="rr-vote-grid">
                      {r.players
                        .filter((p) => p.id !== user?.id)
                        .map((p) => (
                          <button
                            className={`rr-vote-option ${voteTarget === p.id ? 'selected' : ''}`}
                            key={p.id}
                            disabled={busy || r.me.voted}
                            onClick={() => setVoteTarget(p.id)}
                          >
                            <Avatar name={p.username} url={p.avatar} />
                            <span>{p.username}</span>
                            {voteTarget === p.id && <CheckCircle2 size={18} />}
                          </button>
                        ))}
                    </div>
                    {!r.me.voted && (
                      <button
                        className="rr-button primary"
                        disabled={busy || !voteTarget}
                        onClick={() => {
                          void action('vote', { targetId: voteTarget });
                        }}
                      >
                        <Vote size={17} /> Подтвердить голос
                      </button>
                    )}
                    <small>
                      Проголосовали {r.players.filter((p) => p.voted).length} из {r.players.length}. Для
                      решения нужно больше половины голосов.
                    </small>
                  </div>
                )}
                {(r.phase === 'guess' || (spy && ['discussion', 'voting'].includes(r.phase))) && (
                  <div className="rr-phase-content">
                    <span className="rr-phase-icon">
                      <Target />
                    </span>
                    <h3>
                      {spy ? 'Можешь назвать тему прямо сейчас.' : 'Шпион найден. Остался последний ход.'}
                    </h3>
                    <p>
                      {spy
                        ? 'Одна попытка: верная тема принесёт победу, ошибка завершит партию в пользу знатоков.'
                        : 'У шпиона есть одна попытка угадать тему. Не подсказывайте ему.'}
                    </p>
                    {spy && (
                      <form
                        className="rr-form rr-guess-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action('guess', { answer: guess });
                        }}
                      >
                        <label>
                          Название темы
                          <input
                            value={guess}
                            onChange={(e) => setGuess(e.target.value)}
                            required
                            maxLength={240}
                            placeholder="Какое правило обсуждала команда?"
                            autoComplete="off"
                          />
                        </label>
                        <button className="rr-button primary" disabled={busy || !guess.trim()}>
                          Назвать тему
                          <ArrowRight size={17} />
                        </button>
                      </form>
                    )}
                    <small>Если время закончится без верного ответа, побеждают знатоки.</small>
                  </div>
                )}
              </>
            )}
            {r.phase === 'finished' && r.result && (
              <div className="rr-result">
                <div className={`rr-result-emblem ${r.result.winner}`}>
                  <Trophy size={54} />
                  <span>✦</span>
                </div>
                <span className="rr-eyebrow">РАУНД ЗАВЕРШЁН</span>
                <h3>{winner}!</h3>
                <p>{r.result.reason}</p>
                <div className="rr-result-details">
                  <div>
                    <span>Секретная тема</span>
                    <strong>{r.result.topic}</strong>
                  </div>
                  <div>
                    <span>Шпионом был</span>
                    <strong>{r.players.find((p) => p.id === r.result!.spyId)?.username ?? 'Игрок'}</strong>
                  </div>
                </div>
                <div className="rr-vote-summary">
                  {Object.entries(r.result.votes).map(([voter, target]) => (
                    <div key={voter}>
                      <span>{r.players.find((p) => p.id === voter)?.username ?? 'Игрок'}</span>
                      <ArrowRight size={13} />
                      <span>{r.players.find((p) => p.id === target)?.username ?? 'Игрок'}</span>
                    </div>
                  ))}
                </div>
                <div className="rr-result-note">
                  <CheckCircle2 size={16} /> Результат и опыт сохранены на сервере
                </div>
                {host ? (
                  <button
                    className="rr-button primary"
                    disabled={busy}
                    onClick={() => {
                      void action('next');
                    }}
                  >
                    <RotateCcw size={17} /> Следующий раунд
                  </button>
                ) : (
                  <Notice>Следующий раунд запустит ведущий комнаты.</Notice>
                )}
              </div>
            )}
          </div>
          <details className="rr-game-rules">
            <summary>
              <HelpCircle size={17} /> Правила и честная игра
            </summary>
            <div>
              <p>
                <strong>Задача команды:</strong> обнаружить шпиона. Он видит только общую категорию; знатоки —
                название темы.
              </p>
              <p>
                Если больше половины всех игроков выбрали невиновного — выигрывает шпион. Если большинство
                выбрало шпиона, он получает одну попытку угадать точное название темы. Верный ответ приносит
                ему победу, неверный — победу знатокам.
              </p>
              <p>
                Ничья, отсутствие абсолютного большинства или голосов по окончании времени — победа шпиона.
                Истечение времени на ответ шпиона — победа знатоков.
              </p>
              <p>
                Таймеры, голоса и результаты проверяет сервер. Обновление страницы не меняет роль. Если
                ведущий отключится, сервер передаст управление другому подключённому игроку после периода
                ожидания.
              </p>
              <p>
                Перед партией договоритесь, насколько подробные подсказки разрешены. Новые опубликованные
                правила из справочника автоматически расширяют выбор тем.
              </p>
            </div>
          </details>
        </section>
        <aside className="rr-room-aside">
          <section className="rr-panel rr-room-players">
            <div className="rr-section-heading">
              <h2>Команда</h2>
              <span>
                {r.players.length}/{r.maxPlayers}
              </span>
            </div>
            {r.players.map((p) => (
              <div className="rr-member" key={p.id}>
                <div className="rr-member-avatar">
                  <Avatar name={p.username} url={p.avatar} />
                  <span className={`rr-presence ${p.online ? 'online' : ''}`} />
                </div>
                <div>
                  <strong>
                    {p.username}
                    {p.id === user?.id && <span className="rr-you-inline">ты</span>}
                  </strong>
                  <span>{p.id === r.hostId ? 'Ведущий' : p.online ? 'В комнате' : 'Не в сети'}</span>
                </div>
                {p.id === r.hostId && <Crown size={16} className="rr-gold" />}
                {r.phase === 'lobby' && p.ready && <CheckCircle2 size={16} className="rr-green" />}
                {r.phase === 'voting' && p.voted && <Check size={17} className="rr-green" />}
              </div>
            ))}
            {r.phase === 'lobby' && (
              <div className="rr-room-invite-hint">
                <Link2 size={16} />
                <p>Чтобы позвать друзей, создай ссылку-приглашение на странице сервера.</p>
                <button className="rr-text-button" onClick={() => go(`servers/${r.serverId}`)}>
                  К серверу
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </section>
          <RoomChat id={id} />
        </aside>
      </div>
    </>
  );
}

function RoomChat({ id }: { id: string }) {
  const { user } = useAuth(),
    messages = useResource<Message[]>(`/rooms/${id}/messages`, true),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [messages.data?.length]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api(`/rooms/${id}/messages`, json('POST', { text: text.trim() }));
      setText('');
      await messages.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rr-room-chat">
      <div className="rr-chat-heading">
        <MessageCircle size={17} />
        <h2>Чат комнаты</h2>
        <span>ОБЩИЙ</span>
      </div>
      <div className="rr-chat-messages" aria-live="polite" aria-relevant="additions">
        {messages.data?.length ? (
          messages.data.map((m) => (
            <div key={m.id} className={`rr-chat-message ${m.userId === user?.id ? 'self' : ''}`}>
              <div>
                <strong>{m.username}</strong>
                <time>
                  {new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <p>{m.text}</p>
            </div>
          ))
        ) : (
          <div className="rr-chat-empty">
            <MessageCircle size={28} />
            <p>
              Поздоровайся с командой.
              <br />
              Сообщения видят все игроки комнаты.
            </p>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <ErrorNotice text={error || messages.error} />
      <form className="rr-chat-input" onSubmit={send}>
        <input
          aria-label="Сообщение в чат"
          placeholder="Напиши команде…"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button aria-label="Отправить сообщение" disabled={busy || !text.trim()}>
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}
