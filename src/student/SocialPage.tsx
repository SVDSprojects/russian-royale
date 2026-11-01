import { useEffect, useState } from 'react';
import { api, useAuth } from '../api';
import { Avatar, ErrorNotice, go, json, useResource, PageHeader } from './common';
import './social.css';
type Person = {
  id: string;
  publicId: string;
  username: string;
  avatar: string;
  bio: string;
  streak: number;
  activity: { day: string; points: number }[];
  status?: string;
  incoming?: boolean;
  pairStreak?: number;
};
export function SocialPage({ id }: { id?: string }) {
  const auth = useAuth(),
    stats = useResource<{ stats: { games: number; wins: number; lessons: number } }>('/profile', true),
    data = useResource<{ me: Person; friends: Person[] }>('/social/me', true),
    [other, setOther] = useState<Person | null>(null),
    [q, setQ] = useState(''),
    [results, setResults] = useState<Person[]>([]),
    [name, setName] = useState(''),
    [bio, setBio] = useState(''),
    [photo, setPhoto] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [games, setGames] = useState<any[]>([]),
    [chartMode, setChartMode] = useState<'streak' | 'activity'>('streak');
  const own = !id || id === data.data?.me.publicId || id === data.data?.me.id,
    p = own ? data.data?.me : other;
  useEffect(() => {
    if (data.data?.me) {
      setName(data.data.me.username);
      setBio(data.data.me.bio);
    }
  }, [data.data?.me.username, data.data?.me.bio]);
  useEffect(() => {
    setOther(null);
    if (id)
      void api<Person>('/social/profile/' + encodeURIComponent(id))
        .then(setOther)
        .catch((e) => setError(e.message));
  }, [id]);
  async function run(f: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await f();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function friend(target: Person, remove = false) {
    await api('/social/friends/' + target.publicId, json(remove ? 'DELETE' : 'POST'));
    await data.reload();
    setNotice(remove ? 'Запрос или дружба удалены.' : 'Заявка отправлена или принята.');
  }
  async function join(g: any) {
    if (g.game === 'spy') {
      go('rooms/' + g.roomId);
      return;
    }
    try {
      try {
        await api('/games/' + g.game + '/rooms/' + g.roomId + '/view');
        go('games/' + g.game + '/' + g.roomId);
        return;
      } catch {}
      await api(
        '/games/' + g.game + '/rooms/' + g.roomId + '/join',
        json('POST', { commandId: crypto.randomUUID(), expectedVersion: g.version }),
      );
    } catch (e) {
      throw new Error(
        'Не удалось войти: возможно, партия началась или комната обновилась. Нажми «Где играет» ещё раз. ' +
          (e as Error).message,
      );
    }
    go('games/' + g.game + '/' + g.roomId);
  }
  const series = data.data
      ? [data.data.me, ...data.data.friends.filter((f) => f.status === 'accepted')].slice(0, 7)
      : [],
    days = Array.from({ length: 30 }, (_, i) =>
      new Date(Date.now() + 14400000 - (29 - i) * 86400000).toISOString().slice(0, 10),
    ),
    valueAt = (s: Person, d: string) => {
      if (chartMode === 'activity') return s.activity.find((a) => a.day === d)?.points || 0;
      let t = new Date(d + 'T12:00:00Z').getTime(),
        n = 0;
      const set = new Set(s.activity.map((a) => a.day));
      while (set.has(new Date(t).toISOString().slice(0, 10))) {
        n++;
        t -= 86400000;
      }
      return n;
    },
    max = Math.max(1, ...series.flatMap((s) => days.map((d) => valueAt(s, d)))),
    colors = ['#2563eb', '#ec4899', '#059669', '#9333ea', '#ea580c', '#0891b2', '#be123c'];
  return (
    <div className="social-page">
      <PageHeader
        title={own ? 'Профиль и друзья' : 'Профиль игрока'}
        description="Играй вместе, поддерживай ежедневный темп и сравнивай активность."
      />
      <ErrorNotice text={error || data.error} />
      {notice && <p role="status">{notice}</p>}
      {p && (
        <section className="rr-panel">
          <Avatar name={p.username} url={p.avatar} size="large" />
          <h2>{p.username}</h2>
          <p>
            ID: <strong>{p.publicId}</strong>
          </p>
          <p>{p.bio || 'Пока без описания'}</p>
          <strong>🔥 {p.streak} дней подряд</strong>
          {own && (
            <p>
              {stats.data?.stats.games ?? 0} партий в Шпионе · {stats.data?.stats.wins ?? 0} побед ·{' '}
              {stats.data?.stats.lessons ?? 0} уроков
            </p>
          )}
          {!own && (
            <button disabled={busy} onClick={() => void run(() => friend(p))}>
              Добавить / принять дружбу
            </button>
          )}
        </section>
      )}
      {own && (
        <form
          className="rr-panel rr-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/social/me', json('PATCH', { username: name, bio, ...(photo ? { photo } : {}) }));
              setPhoto('');
              await auth.refresh();
              await data.reload();
              setNotice('Профиль сохранён.');
            });
          }}
        >
          <h2>Редактировать профиль</h2>
          <label>
            Ник
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label>
            О себе
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
          </label>
          <label>
            Фото до 2 МБ
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) {
                  setError('Фото должно быть меньше 2 МБ.');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setPhoto(String(reader.result));
                reader.readAsDataURL(f);
              }}
            />
          </label>
          {photo && <img width={100} src={photo} alt="Новое фото" />}
          <button className="rr-button primary" disabled={busy}>
            Сохранить профиль
          </button>
        </form>
      )}
      <section className="rr-panel">
        <h2>Найти друзей</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => setResults(await api('/social/search?q=' + encodeURIComponent(q))));
          }}
        >
          <input
            aria-label="Ник или ID друга"
            value={q}
            minLength={2}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ник или шестизначный ID"
          />
          <button disabled={busy}>Найти</button>
        </form>
        {results.map((f) => (
          <div className="social-person" key={f.id}>
            <button onClick={() => go('profile/' + f.publicId)}>
              {f.username} · {f.publicId}
            </button>
            {f.id !== data.data?.me.id && (
              <button disabled={busy} onClick={() => void run(() => friend(f))}>
                Добавить
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="rr-panel">
        <h2>Друзья и заявки</h2>
        {data.data?.friends.map((f) => (
          <div className="social-person" key={f.id}>
            <Avatar name={f.username} url={f.avatar} />
            <button onClick={() => go('profile/' + f.publicId)}>
              {f.username} · {f.publicId}
            </button>
            <span>
              {f.status === 'accepted'
                ? `🔥 Вместе ${f.pairStreak} дней`
                : f.incoming
                  ? 'Входящая заявка'
                  : 'Заявка отправлена'}
            </span>
            {f.status === 'pending' && f.incoming && (
              <button disabled={busy} onClick={() => void run(() => friend(f))}>
                Принять
              </button>
            )}
            {f.status === 'accepted' && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const rooms = await api<any[]>('/social/friends/' + f.publicId + '/games');
                    setGames(rooms);
                    if (!rooms.length) setNotice('Друг сейчас не в игровой комнате.');
                  })
                }
              >
                Где играет
              </button>
            )}
            {f.status === 'accepted' && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('/notifications/invite/' + f.publicId, json('POST'));
                    setNotice('Приглашение отправлено.');
                  })
                }
              >
                Позвать играть
              </button>
            )}
            <button disabled={busy} onClick={() => void run(() => friend(f, true))}>
              {f.status === 'accepted' ? 'Удалить' : 'Отменить / отклонить'}
            </button>
          </div>
        ))}
        {games.map((g) => (
          <button key={g.game + g.roomId} disabled={busy} onClick={() => void run(() => join(g))}>
            Присоединиться: {g.name}
          </button>
        ))}
      </section>
      <section className="rr-panel social-chart">
        <h2>Ваш темп за 30 дней</h2>
        <label>
          График{' '}
          <select value={chartMode} onChange={(e) => setChartMode(e.target.value as typeof chartMode)}>
            <option value="streak">Серии по дням</option>
            <option value="activity">Активность</option>
          </select>
        </label>
        <p>
          Количество игровых действий и выполненных заданий за день. Серия сохраняется, если сегодня или вчера
          был активный день. Часовой пояс — Ереван.
        </p>
        <div className="social-chart-scroll">
          <svg viewBox="0 0 900 310" role="img" aria-label="График вашей активности и активности друзей">
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line x1={40} x2={880} y1={260 - i * 55} y2={260 - i * 55} stroke="#dbe2ed" />
                <text x={0} y={265 - i * 55} fontSize={14}>
                  {Math.round((max * i) / 4)}
                </text>
              </g>
            ))}
            {series.map((s, i) => (
              <polyline
                key={s.id}
                fill="none"
                stroke={colors[i]}
                strokeWidth={3}
                points={days
                  .map((day, j) => `${40 + (j * 840) / 29},${260 - (valueAt(s, day) * 220) / max}`)
                  .join(' ')}
              />
            ))}
            <text x={40} y={295}>
              {days[0]}
            </text>
            <text x={770} y={295}>
              {days[29]}
            </text>
          </svg>
        </div>
        <div className="social-legend">
          {series.map((s, i) => (
            <span key={s.id} style={{ color: colors[i] }}>
              ● {s.username} · 🔥 {s.streak}
            </span>
          ))}
        </div>
        <p>Новая статистика собирается с момента этого обновления.</p>
      </section>
    </div>
  );
}
