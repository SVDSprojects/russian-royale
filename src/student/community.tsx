import { useCallback, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  Gamepad2,
  Hash,
  Link2,
  LockKeyhole,
  Plus,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { api, useAuth } from '../api';
import {
  Avatar,
  CopyButton,
  Dialog,
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
import { AuthForm } from './StudentApp';
import type { Room, Server } from './models';

export function Servers(){const servers=useResource<(Server & {gameId:string})[]>('/servers',true);return <><PageHeader title="Серверы игр" description="У каждой игры свой общий сервер. Выбирай игру и собирай компанию."/><ErrorNotice text={servers.error}/><div className="rr-server-grid">{servers.data?.map(s=><button className="rr-server-card" key={s.id} onClick={()=>go(s.gameId==='spy'?'servers/'+s.id:'games/'+s.gameId)}><div className="rr-server-card-body"><h2>{s.name}</h2><p>{s.description}</p><span>Открыт всем игрокам</span></div></button>)}</div></>;}
export function ServerDetail({ id }: { id: string }) {
  const { user } = useAuth(),
    server = useResource<Server>(`/servers/${id}`, true),
    [showRoom, setShowRoom] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const close = useCallback(() => setShowRoom(false), []);
  async function invite() {
    setBusy(true);
    setError('');
    try {
      await api(`/servers/${id}/invites`, json('POST'));
      await server.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(token: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/invites/${token}`, json('DELETE'));
      await server.reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (server.loading) return <Loading />;
  const s = server.data;
  if (!s)
    return (
      <>
        <PageHeader title="Сервер недоступен" back="servers" />
        <ErrorNotice text={server.error} />
      </>
    );
  const owner = !id.startsWith('public-') && user?.id === s.ownerId;
  return (
    <>
      <PageHeader
        eyebrow="ОБЩИЙ СЕРВЕР ИГРЫ"
        title={s.name}
        description={s.description || 'Собираемся, общаемся и становимся сильнее вместе.'}
        back="servers"
        action={
          <button className="rr-button primary" onClick={() => setShowRoom(true)}>
            <Plus size={17} /> Создать комнату
          </button>
        }
      />
      <ErrorNotice text={server.error || error} />
      <div className="rr-server-overview">
        <span>
          <LockKeyhole size={16} /> Общий сервер
        </span>
        <span>
          <Users size={16} />
          {s.memberCount} участников
        </span>
        <span>
          <Gamepad2 size={16} />
          {s.roomCount} комнат
        </span>
        {owner && (
          <span className="rr-server-owner">
            <Shield size={15} /> Ты — владелец
          </span>
        )}
      </div>
      <div className="rr-server-detail-grid">
        <section>
          <div className="rr-section-heading">
            <h2>Игровые комнаты</h2>
            <span className="rr-muted">{s.rooms?.length ?? 0}</span>
          </div>
          {s.rooms?.length ? (
            <div className="rr-room-list">
              {s.rooms.map((room) => (
                <button className="rr-room-list-item" key={room.id} onClick={() => go(`rooms/${room.id}`)}>
                  <div className="rr-room-icon">
                    <Gamepad2 size={25} />
                  </div>
                  <div>
                    <h3>{room.name}</h3>
                    <p>
                      Шпион <span>·</span> {room.playerCount} / {room.maxPlayers} игроков
                    </p>
                  </div>
                  <span className={`rr-pill ${room.phase === 'lobby' ? 'teal' : 'purple'}`}>
                    {phaseNames[room.phase]}
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Gamepad2 />}
              heading="Начнём с первой комнаты"
              action={
                <button className="rr-button secondary" onClick={() => setShowRoom(true)}>
                  <Plus size={16} /> Создать комнату «Шпион»
                </button>
              }
            >
              В комнате участники отмечают готовность и получают свои роли.
            </Empty>
          )}
          {owner && (
            <section className="rr-panel rr-invites-panel">
              <div className="rr-section-heading">
                <div>
                  <span className="rr-eyebrow">ВХОД ДЛЯ СВОИХ</span>
                  <h2>Приглашения</h2>
                </div>
                <button
                  className="rr-button secondary small"
                  disabled={busy}
                  onClick={() => {
                    void invite();
                  }}
                >
                  <Link2 size={15} /> Новая ссылка
                </button>
              </div>
              <p className="rr-muted">
                Отправь ссылку друзьям. После регистрации они вернутся к приглашению.
              </p>
              {s.invites?.length ? (
                <div className="rr-invite-list">
                  {s.invites.map((inv) => (
                    <div className="rr-invite-item" key={inv.token}>
                      <input
                        readOnly
                        aria-label="Ссылка-приглашение"
                        value={new URL(inv.url, window.location.origin).href}
                        onFocus={(e) => e.target.select()}
                      />
                      <CopyButton value={inv.url} />
                      <button
                        className="rr-icon-button danger"
                        disabled={busy}
                        aria-label="Отозвать приглашение"
                        title="Отозвать приглашение"
                        onClick={() => {
                          void revoke(inv.token);
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rr-inline-empty">Пока нет действующих приглашений. Создай первую ссылку.</div>
              )}
              <small className="rr-muted">
                Отзыв ссылки закрывает новые вступления. Участники сервера остаются в нём.
              </small>
            </section>
          )}
        </section>
        <aside className="rr-panel rr-members-panel">
          <h2>
            Участники <span>{s.memberCount}</span>
          </h2>
          {s.members?.map((member) => (
            <div className="rr-member" key={member.id}>
              <div className="rr-member-avatar">
                <Avatar name={member.username} url={member.avatar} />
                <span className={`rr-presence ${member.online ? 'online' : ''}`} />
              </div>
              <div>
                <strong>{member.username}</strong>
                <span>
                  {member.id === s.ownerId ? 'Владелец сервера' : member.online ? 'В сети' : 'Не в сети'}
                </span>
              </div>
              {member.id === user?.id && <span className="rr-you-badge">ты</span>}
            </div>
          ))}
        </aside>
      </div>
      {showRoom && (
        <Dialog title="Создать комнату «Шпион»" onClose={close}>
          <RoomForm
            serverId={id}
            onCreated={(r) => {
              setShowRoom(false);
              go(`rooms/${r.id}`);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
const phaseNames = {
  lobby: 'Сбор игроков',
  discussion: 'Обсуждение',
  voting: 'Голосование',
  guess: 'Шпион угадывает',
  finished: 'Раунд завершён',
};
function RoomForm({ serverId, onCreated }: { serverId: string; onCreated: (room: Room) => void }) {
  const [name, setName] = useState('Комната «Шпион»'),
    [max, setMax] = useState(10),
    [discussion, setDiscussion] = useState(180),
    [vote, setVote] = useState(45),
    [guess, setGuess] = useState(30),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onCreated(
        await api<Room>(
          `/servers/${serverId}/rooms`,
          json('POST', {
            name,
            maxPlayers: max,
            discussionSeconds: discussion,
            voteSeconds: vote,
            guessSeconds: guess,
          }),
        ),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="rr-form" onSubmit={submit}>
      <label>
        Название
        <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="rr-form-grid">
        <label>
          Максимум игроков
          <input
            type="number"
            required
            min={3}
            max={30}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </label>
        <label>
          Обсуждение, секунд
          <input
            type="number"
            required
            min={30}
            max={900}
            value={discussion}
            onChange={(e) => setDiscussion(Number(e.target.value))}
          />
        </label>
        <label>
          Голосование, секунд
          <input
            type="number"
            required
            min={15}
            max={180}
            value={vote}
            onChange={(e) => setVote(Number(e.target.value))}
          />
        </label>
        <label>
          Ответ шпиона, секунд
          <input
            type="number"
            required
            min={15}
            max={120}
            value={guess}
            onChange={(e) => setGuess(Number(e.target.value))}
          />
        </label>
      </div>
      <Notice>
        В игре один шпион. Для запуска нужны минимум три игрока, и все должны подтвердить готовность.
      </Notice>
      <ErrorNotice text={error} />
      <button className="rr-button primary full" disabled={busy}>
        {busy ? 'Создаём…' : 'Создать комнату'}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}

export function Invitation({ token }: { token: string }) {
  const { user } = useAuth(),
    invite = useResource<{ server: { id: string; name: string; description: string }; valid: boolean }>(
      `/invites/${encodeURIComponent(token)}`,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function join() {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ serverId: string }>(`/invites/${encodeURIComponent(token)}/join`, json('POST'));
      go(`servers/${res.serverId}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (invite.loading) return <Loading />;
  if (!invite.data)
    return (
      <>
        <PageHeader
          title="Приглашение недоступно"
          description="Ссылка могла быть отозвана владельцем сервера."
        />
        <ErrorNotice text={invite.error} />
        <button className="rr-button secondary" onClick={() => go('servers')}>
          К моим серверам
        </button>
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="ТЕБЯ ЗДЕСЬ ЖДУТ"
        title="Твоя команда собирается"
        description="Присоединяйся к закрытому серверу и играй вместе с друзьями."
      />
      <div className={`rr-invitation-layout ${user ? 'signed' : ''}`}>
        <section className="rr-invitation-card">
          <span className="rr-invitation-icon">
            <Users size={46} />
          </span>
          <span className="rr-pill purple">
            <LockKeyhole size={13} /> ПРИГЛАШЕНИЕ НА СЕРВЕР
          </span>
          <h2>{invite.data.server.name}</h2>
          <p>{invite.data.server.description || 'Место для вашей команды, разговоров и новых побед.'}</p>
          <div className="rr-invitation-features">
            <span>
              <CheckCircle2 size={17} /> Закрытое сообщество
            </span>
            <span>
              <CheckCircle2 size={17} /> Общие игровые комнаты
            </span>
          </div>
          <ErrorNotice text={error} />
          {user ? (
            <button
              className="rr-button primary full"
              disabled={busy}
              onClick={() => {
                void join();
              }}
            >
              {busy ? 'Присоединяемся…' : 'Присоединиться к серверу'}
              <ArrowRight size={17} />
            </button>
          ) : (
            <Notice>Войди или создай аккаунт. Это приглашение останется на месте.</Notice>
          )}
        </section>
        {!user && <AuthForm />}
      </div>
    </>
  );
}
