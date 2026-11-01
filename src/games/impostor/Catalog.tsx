// Обложка игры и список комнат сервера: создание комнаты, вход, сообщение о нехватке контента.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DoorOpen, Plus, Users } from "lucide-react";
import { LIMITS, MAX_PLAYERS, MIN_PLAYERS } from "../../../shared/games/impostor/types";
import { createImpostorApi, type CatalogInfo, type ImpostorApi, type RoomSummary } from "./client";
import { ErrorNote, PHASE_LABEL, Starfield, useAction } from "./ui";

export interface ImpostorCatalogProps {
  serverId: string;
  onOpenRoom: (roomId: string) => void;
  api?: ImpostorApi;
}

const STATUS_LABEL: Record<RoomSummary["status"], string> = { lobby: "ждут игроков", active: "идёт партия", finished: "завершена", cancelled: "отменена" };

export function ImpostorCover() {
  return (
    <div className="rr-impostor-cover">
      <img src="/games/impostor/cover.svg" alt="Две бумажные планеты на общей орбите и маленькие спутники вокруг" width={640} height={360} />
      <div>
        <p className="rr-impostor-kicker">Русский Royale · {MIN_PLAYERS}–{MAX_PLAYERS} игроков</p>
        <h2>Самозванец</h2>
        <p>У всех одна тема — у одного похожая, но другая. Приводите примеры, спорьте и найдите, чья орбита отклонилась.</p>
      </div>
    </div>
  );
}

export function ImpostorCatalog({ serverId, onOpenRoom, api }: ImpostorCatalogProps) {
  const client = useMemo(() => api ?? createImpostorApi(), [api]);
  const [info, setInfo] = useState<CatalogInfo | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("Обсерватория");
  const [chat, setChat] = useState(true);
  const creating = useAction();

  const load = useCallback(async () => {
    try {
      const [catalog, list] = await Promise.all([client.catalog(), client.listRooms(serverId)]);
      setInfo(catalog);
      setRooms(list.rooms);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить комнаты");
    }
  }, [client, serverId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [load]);

  const create = (event: FormEvent) => {
    event.preventDefault();
    void creating.run(async () => {
      const created = await client.createRoom(serverId, name, { chat });
      onOpenRoom(created.roomId);
    });
  };

  return (
    <section className="rr-game-impostor rr-impostor-catalog" aria-labelledby="rr-impostor-catalog-title">
      <Starfield />
      <h1 id="rr-impostor-catalog-title" className="rr-impostor-sr">
        Самозванец — каталог комнат
      </h1>
      <ImpostorCover />
      {info && !info.enoughContent ? (
        <div className="rr-impostor-card rr-impostor-warning" role="status">
          <h3>Игра пока недоступна</h3>
          <p>Нет опубликованных пар тем. Комнату создать можно, но начать партию получится после публикации контента редактором.</p>
        </div>
      ) : null}
      <ErrorNote message={loadError} onClose={() => setLoadError(null)} />
      <div className="rr-impostor-layout">
        <form className="rr-impostor-card rr-impostor-form" onSubmit={create}>
          <h3>
            <Plus aria-hidden="true" /> Новая комната
          </h3>
          <label htmlFor="rr-impostor-room-name">Название</label>
          <input id="rr-impostor-room-name" value={name} maxLength={LIMITS.roomNameChars} onChange={(event) => setName(event.target.value)} required />
          <label className="rr-impostor-switch">
            <input type="checkbox" checked={chat} onChange={(event) => setChat(event.target.checked)} /> Чат во время обсуждения
          </label>
          <button type="submit" className="rr-impostor-btn rr-impostor-btn--accent" disabled={creating.busy || !name.trim()}>
            Создать и войти
          </button>
          <ErrorNote message={creating.error} onClose={() => creating.setError(null)} />
        </form>
        <div className="rr-impostor-card">
          <h3>
            <Users aria-hidden="true" /> Комнаты сервера
          </h3>
          {rooms.length === 0 ? <p className="rr-impostor-muted">Комнат пока нет — создайте первую.</p> : null}
          <ul className="rr-impostor-rooms">
            {rooms.map((room) => (
              <li key={room.id}>
                <div>
                  <b>{room.name}</b>
                  <span className="rr-impostor-muted">
                    {" "}
                    · {room.playerCount}/{room.maxPlayers} · {STATUS_LABEL[room.status]}
                    {room.status === "active" ? ` (${PHASE_LABEL[room.phase as keyof typeof PHASE_LABEL] ?? room.phase})` : ""}
                  </span>
                </div>
                <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={() => onOpenRoom(room.id)}>
                  <DoorOpen aria-hidden="true" /> {room.joinable ? "Войти" : "Открыть"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
