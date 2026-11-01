import { useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Flag,
  Layers3,
  Plus,
  RefreshCw,
  Users,
  Waves,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import { ErrorNotice, Loading, useResource, go, json } from '../student/common';
import { GameArt } from '../student/GameArt';
import type { Server } from '../student/models';
import { Page as Jeopardy } from './jeopardy/Page';
import { Page as Roulette } from './roulette/Page';
import './game-entrance.css';

type GameKind = 'jeopardy' | 'roulette';
type RoomSummary = {
  id: string;
  name: string;
  phase: string;
  players: number;
  version: number;
  joined: boolean;
};
export function GameRooms({ game, roomId }: { game: GameKind; roomId?: string }) {
  if (roomId)
    return game === 'jeopardy' ? (
      <Jeopardy key={roomId} roomId={roomId} />
    ) : (
      <Roulette key={roomId} roomId={roomId} />
    );
  return <Browser key={game} game={game} />;
}
function Browser({ game }: { game: GameKind }) {
  const servers = useResource<Server[]>('/servers?game=' + game, true);
  const [server, setServer] = useState(''),
    [content, setContent] = useState(''),
    [name, setName] = useState('Новая партия'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('points'),
    [teamCount, setTeamCount] = useState(2);
  const selected = server || servers.data?.[0]?.id || '';
  const base = '/games/' + game;
  const packs = useResource<{ content: { id: string; title: string }[] }>(base + '/content');
  const rooms = useResource<{ rooms: RoomSummary[] }>(
    selected ? base + '/rooms?serverId=' + encodeURIComponent(selected) : null,
    true,
  );
  const island = game === 'jeopardy';
  async function create() {
    setBusy(true);
    setError('');
    try {
      const contentId = content || packs.data?.content[0]?.id;
      const settings = island
        ? { contentId, teamCount }
        : { contentId, mode, durations: [100000, 100000, 100000] };
      const result = await api<{ roomId: string }>(
        base + '/rooms',
        json('POST', {
          serverId: selected,
          name,
          settings,
          commandId: crypto.randomUUID(),
          expectedVersion: 0,
        }),
      );
      go(`games/${game}/${result.roomId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function join(r: RoomSummary) {
    setBusy(true);
    setError('');
    try {
      if (!r.joined)
        await api(
          base + '/rooms/' + r.id + '/join',
          json('POST', { commandId: crypto.randomUUID(), expectedVersion: r.version }),
        );
      go(`games/${game}/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      void rooms.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`game-entrance game-entrance--${game}`}>
      <button className="entrance-back" onClick={() => go('games')}>
        <ArrowLeft size={16} /> Все игры
      </button>
      <section className="entrance-hero">
        <div className="entrance-copy">
          <span className="entrance-eyebrow">
            <span /> {island ? 'ЭКСПЕДИЦИЯ ЗА ЗНАНИЯМИ' : 'КОЛЕСО ВРАЩАЕТСЯ. ИГРА НАЧИНАЕТСЯ.'}
          </span>
          <h1>
            {island ? (
              'Своя игра'
            ) : (
              <>
                Русская
                <br />
                рулетка
              </>
            )}
          </h1>
          <p>
            {island
              ? 'Пять островов, смелые капитаны и вопросы с характером. Собери команду и проложи свой путь к победе.'
              : 'Удача выбирает тему. Победу решают знания. Лови свой момент — и отвечай раньше остальных.'}
          </p>
          <div className="entrance-facts">
            <span>
              <Users size={15} /> {island ? '2–4 команды' : '2–16 игроков'}
            </span>
            <span>
              <Layers3 size={15} /> {island ? '25 вопросов' : '3 режима'}
            </span>
            <span>
              <Sparkles size={15} /> Вместе с друзьями
            </span>
          </div>
        </div>
        <div className="entrance-scene">
          <GameArt kind={island ? 'grid' : 'target'} />
          <span className="entrance-orbit orbit-one" />
          <span className="entrance-orbit orbit-two" />
          <span className="entrance-scene-note">
            {island ? 'ДЕРЖИ КУРС НА ОТКРЫТИЕ' : 'СЛЕДУЮЩИЙ ХОД — ТВОЙ'}
          </span>
        </div>
      </section>
      <ErrorNotice text={error || servers.error || packs.error || rooms.error} />
      {servers.loading ? (
        <Loading />
      ) : !servers.data?.length ? (
        <section className="entrance-no-server">
          <div className="entrance-empty-icon">
            <Users size={30} />
          </div>
          <div>
            <span className="entrance-eyebrow">НАЧНЁМ С КОМПАНИИ</span>
            <h2>Для приключения нужны друзья</h2>
            <p>
              Создай ваш общий сервер или открой приглашение друга. После этого здесь появятся ваши партии.
            </p>
          </div>
          <button className="rr-button primary" onClick={() => go('servers')}>
            Мои серверы <ArrowUpRight size={18} />
          </button>
        </section>
      ) : (
        <div className="entrance-columns">
          <section className="entrance-setup">
            <div className="entrance-section-title">
              <span className="entrance-step">01</span>
              <div>
                <h2>Собери свою партию</h2>
                <p>Пара настроек — и можно звать друзей.</p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && selected && packs.data?.content.length && name.trim()) void create();
              }}
            >
              <div className="entrance-fields">
                <label>
                  Где собираемся
                  <select
                    aria-label="Сервер игры"
                    value={selected}
                    onChange={(e) => setServer(e.target.value)}
                  >
                    {servers.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Что будем изучать
                  <select
                    aria-label="Набор заданий"
                    value={content || packs.data?.content[0]?.id || ''}
                    onChange={(e) => setContent(e.target.value)}
                  >
                    {packs.data?.content.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                {island ? (
                  <label>
                    Сколько команд
                    <select
                      aria-label="Число команд"
                      value={teamCount}
                      onChange={(e) => setTeamCount(Number(e.target.value))}
                    >
                      {[2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} команды
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    Как играем
                    <select aria-label="Режим игры" value={mode} onChange={(e) => setMode(e.target.value)}>
                      <option value="points">На очки</option>
                      <option value="elimination">На выбывание</option>
                      <option value="speed">На скорость</option>
                    </select>
                  </label>
                )}
                <label>
                  Название партии
                  <input
                    aria-label="Название комнаты"
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </div>
              <div className="entrance-mode-note">
                {island ? <Flag size={18} /> : <Sparkles size={18} />}
                <p>
                  {island
                    ? 'Капитан выбирает вопрос. Кто первым подаст сигнал, тот отвечает.'
                    : mode === 'elimination'
                      ? 'У каждого два билета. Ошибка стоит одного. Останься в игре до конца.'
                      : mode === 'speed'
                        ? 'Правильный ответ приносит очки. Чем быстрее ответишь, тем больше бонус.'
                        : 'Десять раундов. Один вопрос для всех. Побеждает тот, кто набрал больше очков.'}
                </p>
              </div>
              <button
                className="rr-button primary entrance-create"
                disabled={busy || !selected || !packs.data?.content.length || !name.trim()}
              >
                <Plus size={18} /> Создать партию <ArrowUpRight size={18} />
              </button>
              {!packs.loading && !packs.data?.content.length && (
                <p className="entrance-help">Редактору нужно опубликовать набор заданий в админке.</p>
              )}
            </form>
          </section>
          <section className="entrance-rooms">
            <div className="entrance-section-title">
              <span className="entrance-step">02</span>
              <div>
                <h2>Ваша компания</h2>
                <p>Комнаты выбранного сервера.</p>
              </div>
              <button
                className="entrance-refresh"
                aria-label="Обновить комнаты"
                disabled={rooms.loading}
                onClick={() => void rooms.reload()}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            {rooms.loading && !rooms.data ? (
              <Loading />
            ) : (
              <div className="entrance-room-list">
                {rooms.data?.rooms.map((r) => (
                  <article key={r.id} className="entrance-room">
                    <div
                      className={`entrance-room-state ${r.phase === 'lobby' ? 'waiting' : r.phase === 'finished' ? 'finished' : 'playing'}`}
                    >
                      <span />
                      {r.phase === 'lobby'
                        ? 'Сбор игроков'
                        : r.phase === 'finished'
                          ? 'Партия завершена'
                          : 'Идёт игра'}
                    </div>
                    <h3>{r.name}</h3>
                    <div className="entrance-room-bottom">
                      <span>
                        <Users size={14} /> Игроков: {r.players}
                      </span>
                      <button
                        disabled={busy || (!r.joined && r.phase !== 'lobby')}
                        onClick={() => void join(r)}
                      >
                        {r.joined ? 'Вернуться' : 'Присоединиться'} <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!rooms.loading && !rooms.data?.rooms.length && (
              <div className="entrance-empty">
                <div className="entrance-empty-icon">
                  {island ? <Waves size={35} /> : <Sparkles size={35} />}
                </div>
                <h3>{island ? 'Море пока спокойно' : 'Колесо ждёт игроков'}</h3>
                <p>Создай первую партию. Друзья увидят её здесь, когда выберут этот же сервер.</p>
              </div>
            )}
            <div className="entrance-friend-note">
              <Users size={20} />
              <p>
                Ссылку для друзей можно получить в разделе{' '}
                <button onClick={() => go('servers')}>«Мои серверы»</button>. В комнате каждый отмечает
                готовность, а ведущий начинает игру.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
