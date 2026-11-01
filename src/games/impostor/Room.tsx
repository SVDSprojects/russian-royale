// Контейнер комнаты: загрузка view через client.ts, вход в лобби, переключение Lobby/Game.
import { useMemo } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { createImpostorApi, type ImpostorApi, type Subscribe, useImpostorRoom } from "./client";
import { Game } from "./Game";
import { Lobby } from "./Lobby";
import { ErrorNote, Starfield, useAction } from "./ui";

export interface ImpostorRoomProps {
  roomId: string;
  currentUserId: string;
  onExit: () => void;
  api?: ImpostorApi;
  /** Адаптер к live-уведомлениям сайта (useLive). Без него работает heartbeat-опрос. */
  subscribe?: Subscribe;
}

export function ImpostorRoom({ roomId, currentUserId, onExit, api, subscribe }: ImpostorRoomProps) {
  const client = useMemo(() => api ?? createImpostorApi(), [api]);
  const room = useImpostorRoom(roomId, client, subscribe);
  const joining = useAction();

  if (!room.data) {
    return (
      <section className="rr-game-impostor rr-impostor-placeholder" aria-busy={!room.error}>
        <Starfield />
        {room.error ? (
          <div className="rr-impostor-card rr-impostor-warning" role="alert">
            <h2>Комната недоступна</h2>
            <p>{room.error}</p>
            <button type="button" className="rr-impostor-btn" onClick={onExit}>
              В каталог
            </button>
          </div>
        ) : (
          <p className="rr-impostor-loading">
            <LoaderCircle className="rr-impostor-spin" aria-hidden="true" /> Настраиваем телескоп…
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
        <div className="rr-game-impostor rr-impostor-joinbar">
          <span>{wasParticipant ? "Вы вышли из партии. Место за вами сохранено." : "Вы смотрите лобби со стороны."}</span>
          <button type="button" className="rr-impostor-btn rr-impostor-btn--accent" disabled={joining.busy} onClick={() => void joining.run(room.join)}>
            <LogIn aria-hidden="true" /> {wasParticipant ? "Вернуться" : "Войти в комнату"}
          </button>
          <ErrorNote message={joining.error} onClose={() => joining.setError(null)} />
        </div>
      ) : null}
      {view.phase === "lobby" ? <Lobby {...props} /> : <Game {...props} />}
    </>
  );
}
