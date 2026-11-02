import { checkpointClient } from './checkpoint-client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../api';
import { useResource, go, ErrorNotice } from '../student/common';
import { Game as Mafia } from './mafia';
import { Game as Bunker } from './bunker';
import { Game as Broken } from './broken-text';
import { http } from './durak/client';
import type { Envelope } from './mafia/client';
import type { Action } from '../../shared/games/mafia/types';
const games = {
  mafia: { name: 'Мафия', Component: Mafia, note: '6–16 игроков. Ночной чат мафии пока не доступен.' },
  bunker: {
    name: 'Бункер',
    Component: Bunker,
    note: '4–16 игроков. Трата жетонов и иммунитет пока не доступны.',
  },
  'broken-text': {
    name: 'Испорченный текст',
    Component: Broken,
    note: 'Личный режим. Командный и поочерёдный режимы пока не доступны.',
  },
};
type Summary = { id: string; name: string; version: number; phase: string; count: number; joined: boolean };
export function CheckpointPage({ game, roomId }: { game: keyof typeof games; roomId?: string }) {
  const { user } = useAuth(),
    servers = useResource<{ id: string; name: string }[]>('/servers?game=' + game, true);
  const [server, setServer] = useState(''),
    [name, setName] = useState('Вечерняя игра'),
    [rooms, setRooms] = useState<Summary[]>([]),
    [data, setData] = useState<Envelope | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false);
  const selected = server || servers.data?.[0]?.id || '',
    base = '/api/games/' + game,
    { Component } = games[game];
  const client = useMemo(() => (roomId ? checkpointClient(game, roomId, setData) : null), [game, roomId]);
  const actionLock = useRef(false);
  async function load() {
    if (client) await client.refresh();
    else if (selected)
      setRooms((await http(base + '/rooms?serverId=' + encodeURIComponent(selected))) as Summary[]);
  }
  useEffect(() => {
    let live = true,
      loading = false;
    client?.activate();
    setData(null);
    const reload = async () => {
      if (loading) return;
      loading = true;
      try {
        await load();
        if (live) setConnected(true);
      } catch (e) {
        if (live) {
          setConnected(false);
          setError((e as Error).message);
        }
      } finally {
        loading = false;
      }
    };
    void reload();
    const t = setInterval(reload, 5000);
    window.addEventListener('rr-live', reload);
    window.addEventListener('online', reload);
    return () => {
      live = false;
      client?.dispose();
      clearInterval(t);
      window.removeEventListener('rr-live', reload);
      window.removeEventListener('online', reload);
    };
  }, [client, selected]);
  async function run(fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }
  async function post(path: string, version: number, extra = {}) {
    return (await http(base + path, {
      method: 'POST',
      body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: version, ...extra }),
    })) as Envelope;
  }
  async function send(action: Action) {
    if (client) await client.send(action);
  }
  return (
    <>
      <p>
        <strong>Бета · {games[game].name}</strong> — {games[game].note}
      </p>
      <ErrorNotice text={error} />
      {roomId ? (
        data ? (
          <>
            <button onClick={() => go('games/' + game)}>К списку комнат</button>
            {data.view.phase === 'lobby' && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await client!.command('leave');
                    go('games/' + game);
                  })
                }
              >
                Покинуть комнату
              </button>
            )}
            {data.view.phase === 'finished' && data.view.hostId === user!.id && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await client!.command('rematch');
                  })
                }
              >
                Реванш
              </button>
            )}
            <Component
              view={data.view}
              currentUserId={user!.id}
              connection={connected ? 'online' : 'reconnecting'}
              serverNowMs={data.serverNow}
              onExit={() => go('games/' + game)}
              send={send}
            />
          </>
        ) : (
          <p>
            Загрузка… <button onClick={() => go('games/' + game)}>К комнатам</button>
          </p>
        )
      ) : (
        <main className={'rr-game-' + game}>
          <h1>{games[game].name}</h1>
          <label>
            Сервер{' '}
            <select value={selected} onChange={(e) => setServer(e.target.value)}>
              {servers.data?.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Название <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <button
            disabled={busy || !selected || !name.trim()}
            onClick={() =>
              void run(async () => {
                const d = await post('/rooms', 0, { serverId: selected, name, settings: {} });
                go('games/' + game + '/' + d.roomId);
              })
            }
          >
            Создать комнату
          </button>
          {!selected && <button onClick={() => go('servers')}>Вступить на сервер</button>}
          {rooms.map((r) => (
            <article key={r.id}>
              <h2>{r.name}</h2>
              <p>
                {r.count} игроков · {r.phase === 'lobby' ? 'Сбор игроков' : 'Партия'}
              </p>
              <button
                disabled={busy || (!r.joined && (r.phase !== 'lobby' || r.count >= 16))}
                onClick={() =>
                  void run(async () => {
                    if (!r.joined) await post('/rooms/' + r.id + '/join', r.version);
                    go('games/' + game + '/' + r.id);
                  })
                }
              >
                {r.joined ? 'Вернуться' : 'Присоединиться'}
              </button>
            </article>
          ))}
        </main>
      )}
    </>
  );
}
