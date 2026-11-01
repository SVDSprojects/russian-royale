// Контейнер комнаты: загрузка view через client.ts, вход в лобби, переключение Lobby/Game.
import { useMemo } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { createAliasApi, type AliasApi, type Subscribe, useAliasRoom } from "./client";
import { Game } from "./Game";
import { Lobby } from "./Lobby";
import { ErrorNote, FactoryBackdrop, useAction } from "./ui";

export interface AliasRoomProps {
  roomId: string;
  currentUserId: string;
  onExit: () => void;
  api?: AliasApi;
  /** Адаптер к live-уведомлениям сайта (useLive). Без него работает heartbeat-опрос. */
  subscribe?: Subscribe;
}

export function AliasRoom({ roomId, currentUserId, onExit, api, subscribe }: AliasRoomProps) {
  const client = useMemo(() => api ?? createAliasApi(), [api]);
  const room = useAliasRoom(roomId, client, subscribe);
  const joining = useAction();

  if (!room.data) {
    return (
      <section className="rr-game-alias rr-alias-placeholder" aria-busy={!room.error}>
        <FactoryBackdrop />
        {room.error ? (
          <div className="rr-alias-card rr-alias-warning" role="alert">
            <h2>Комната недоступна</h2>
            <p>{room.error}</p>
            <button type="button" className="rr-alias-btn" onClick={onExit}>
              В каталог
            </button>
          </div>
        ) : (
          <p className="rr-alias-loading">
            <LoaderCircle className="rr-alias-spin" aria-hidden="true" /> Запускаем конвейер…
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
        <div className="rr-game-alias rr-alias-joinbar">
          <span>{wasParticipant ? "Вы вышли из партии. Место за вами сохранено." : "Вы смотрите лобби со стороны."}</span>
          <button type="button" className="rr-alias-btn rr-alias-btn--accent" disabled={joining.busy} onClick={() => void joining.run(room.join)}>
            <LogIn aria-hidden="true" /> {wasParticipant ? "Вернуться" : "Войти в комнату"}
          </button>
          <ErrorNote message={joining.error} onClose={() => joining.setError(null)} />
        </div>
      ) : null}
      {view.phase === "lobby" ? <Lobby {...props} /> : <Game {...props} />}
    </>
  );
}
