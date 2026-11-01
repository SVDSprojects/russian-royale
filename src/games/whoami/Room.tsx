// Контейнер комнаты: загрузка view через client.ts, вход в лобби, переключение Lobby/Game.
import { useMemo } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { createWhoamiApi, type WhoamiApi, type Subscribe, useWhoamiRoom } from "./client";
import { Game } from "./Game";
import { Lobby } from "./Lobby";
import { ErrorNote, MuseumHall, useAction } from "./ui";

export interface WhoamiRoomProps {
  roomId: string;
  currentUserId: string;
  onExit: () => void;
  api?: WhoamiApi;
  /** Адаптер к live-уведомлениям сайта (useLive). Без него работает heartbeat-опрос. */
  subscribe?: Subscribe;
}

export function WhoamiRoom({ roomId, currentUserId, onExit, api, subscribe }: WhoamiRoomProps) {
  const client = useMemo(() => api ?? createWhoamiApi(), [api]);
  const room = useWhoamiRoom(roomId, client, subscribe);
  const joining = useAction();

  if (!room.data) {
    return (
      <section className="rr-game-whoami rr-whoami-placeholder" aria-busy={!room.error}>
        <MuseumHall />
        {room.error ? (
          <div className="rr-whoami-card rr-whoami-warning" role="alert">
            <h2>Комната недоступна</h2>
            <p>{room.error}</p>
            <button type="button" className="rr-whoami-btn" onClick={onExit}>
              В каталог
            </button>
          </div>
        ) : (
          <p className="rr-whoami-loading">
            <LoaderCircle className="rr-whoami-spin" aria-hidden="true" /> Открываем залы музея…
          </p>
        )}
      </section>
    );
  }

  const { view, serverNow } = room.data;
  const props = { view, currentUserId, send: room.send, connection: room.connection, serverNowMs: serverNow, onExit };
  const canJoin = !view.isParticipant && view.phase === "lobby" && view.participants.filter((p) => !p.left).length < view.maxPlayers;
  const wasParticipant = view.participants.some((p) => p.id === currentUserId && p.left);

  return (
    <>
      {canJoin || (wasParticipant && view.phase !== "finished" && view.phase !== "cancelled") ? (
        <div className="rr-game-whoami rr-whoami-joinbar">
          <span>{wasParticipant ? "Вы вышли из партии. Ваша табличка сохранена." : "Вы смотрите лобби со стороны."}</span>
          <button type="button" className="rr-whoami-btn rr-whoami-btn--accent" disabled={joining.busy} onClick={() => void joining.run(room.join)}>
            <LogIn aria-hidden="true" /> {wasParticipant ? "Вернуться" : "Войти в комнату"}
          </button>
          <ErrorNote message={joining.error} onClose={() => joining.setError(null)} />
        </div>
      ) : null}
      {view.phase === "lobby" ? <Lobby {...props} /> : <Game {...props} />}
    </>
  );
}
