import { useEffect, useState } from 'react';
import { ArrowUpRight, Radio, Users } from 'lucide-react';
import { api } from '../api';
import { ErrorNotice, go, json, message, useResource } from './common';
import type { WaitingGame } from '../../shared/waiting-games';
import './waiting-games.css';

const names = { spy:'Шпион',jeopardy:'Своя игра',roulette:'Русская рулетка',alias:'Alias',whoami:'Кто я?',impostor:'Самозванец',mafia:'Мафия',bunker:'Бункер','broken-text':'Испорченный текст',durak:'Дурак' };
export function WaitingGames() {
  const feed = useResource<{ rooms: WaitingGame[] }>('/waiting-games', true);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) void feed.reload();
    };
    const timer = setInterval(refresh, 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [feed.reload]);
  async function join(room: WaitingGame) {
    setBusy(room.id);
    setError('');
    try {
      if (room.game === 'spy') {
        go(`rooms/${room.id}`);
        return;
      }
      const base = `/games/${room.game}`;
      type Summary = { id: string; phase: string; version: number; joined: boolean };
      const latest = await api<{ rooms: Summary[] } | Summary[]>(
        `${base}/rooms?serverId=${encodeURIComponent(room.serverId)}`,
      );
      const target = (Array.isArray(latest) ? latest : latest.rooms).find((r) => r.id === room.id);
      if (!target || target.phase !== 'lobby')
        throw new Error('Эта партия уже началась или недоступна. Выбери другую комнату.');
      if (!target.joined)
        await api(
          `${base}/rooms/${room.id}/join`,
          json('POST', { commandId: crypto.randomUUID(), expectedVersion: target.version }),
        );
      go(`games/${room.game}/${room.id}`);
    } catch (e) {
      setError(message(e));
      void feed.reload();
    } finally {
      setBusy('');
    }
  }
  const rooms = feed.error ? [] : (feed.data?.rooms ?? []);
  if (!rooms.length && !error) return null;
  return (
    <section className="waiting-games" aria-labelledby="waiting-games-title">
      <header>
        <span className="waiting-games-icon">
          <Radio size={25} />
        </span>
        <div>
          <span className="waiting-games-kicker">КОМПАНИЯ УЖЕ СОБИРАЕТСЯ</span>
          <h2 id="waiting-games-title">Скорее присоединяйтесь к игре!</h2>
          <p>На ваших серверах ждут игроков. Выбирай комнату и заходи.</p>
        </div>
      </header>
      <ErrorNotice text={error} />
      <div className="waiting-games-list">
        {rooms.map((room) => (
          <article key={`${room.game}-${room.id}`}>
            <span className="waiting-game-label">
              <i />
              {names[room.game]}
            </span>
            <h3>{room.serverName}</h3>
            <p>{room.name}</p>
            <div className="waiting-game-bottom">
              <span>
                <Users size={14} /> Ждут в комнате: {room.waiting}
              </span>
              <button
                disabled={!!busy}
                onClick={() => void join(room)}
                aria-label={`Присоединиться: ${room.serverName}, ${room.name}`}
              >
                {busy === room.id ? 'Входим…' : 'Присоединиться'}
                <ArrowUpRight size={17} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
