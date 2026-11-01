// Обложка игры и список комнат сервера: создание комнаты, вход, сообщение о нехватке контента.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DoorOpen, Plus, Users } from "lucide-react";
import { LIMITS, MAX_PLAYERS, MIN_PLAYERS, type DifficultySetting } from "../../../shared/games/whoami/types";
import { createWhoamiApi, type CatalogInfo, type WhoamiApi, type RoomSummary } from "./client";
import { ErrorNote, MuseumHall, PHASE_LABEL, useAction } from "./ui";

export interface WhoamiCatalogProps {
  serverId: string;
  onOpenRoom: (roomId: string) => void;
  api?: WhoamiApi;
}

const STATUS_LABEL: Record<RoomSummary["status"], string> = { lobby: "ждут игроков", active: "идёт партия", finished: "завершена", cancelled: "отменена" };

export function WhoamiCover() {
  return (
    <div className="rr-whoami-cover">
      <img src="/games/whoami/cover.svg" alt="Зал музея: рамки с табличками слов, одна повёрнута обратной стороной с вопросительным знаком" width={640} height={360} />
      <div>
        <p className="rr-whoami-kicker">Русский Royale · {MIN_PLAYERS}–{MAX_PLAYERS} игроков</p>
        <h2>Кто я</h2>
        <p>Над каждым висит табличка с термином: чужие вы читаете, свою — нет. Задавайте вопросы, слушайте зал и угадайте, кто вы.</p>
      </div>
    </div>
  );
}

export function WhoamiCatalog({ serverId, onOpenRoom, api }: WhoamiCatalogProps) {
  const client = useMemo(() => api ?? createWhoamiApi(), [api]);
  const [info, setInfo] = useState<CatalogInfo | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("Музей");
  const [difficulty, setDifficulty] = useState<DifficultySetting>("any");
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
      const created = await client.createRoom(serverId, name, { difficulty });
      onOpenRoom(created.roomId);
    });
  };

  return (
    <section className="rr-game-whoami rr-whoami-catalog" aria-labelledby="rr-whoami-catalog-title">
      <MuseumHall />
      <h1 id="rr-whoami-catalog-title" className="rr-whoami-sr">
        Кто я — каталог комнат
      </h1>
      <WhoamiCover />
      {info && !info.enoughContent ? (
        <div className="rr-whoami-card rr-whoami-warning" role="status">
          <h3>Игра пока недоступна</h3>
          <p>Опубликованных терминов меньше трёх. Комнату создать можно, но начать партию получится после публикации контента редактором.</p>
        </div>
      ) : null}
      <ErrorNote message={loadError} onClose={() => setLoadError(null)} />
      <div className="rr-whoami-layout">
        <form className="rr-whoami-card rr-whoami-form" onSubmit={create}>
          <h3>
            <Plus aria-hidden="true" /> Новая комната
          </h3>
          <label htmlFor="rr-whoami-room-name">Название</label>
          <input id="rr-whoami-room-name" value={name} maxLength={LIMITS.roomNameChars} onChange={(event) => setName(event.target.value)} required />
          <label className="rr-whoami-select">
            Термины
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultySetting)}>
              <option value="any">Любые</option>
              <option value="easy">Простые</option>
              <option value="medium">Средние</option>
              <option value="hard">Сложные</option>
            </select>
          </label>
          <button type="submit" className="rr-whoami-btn rr-whoami-btn--accent" disabled={creating.busy || !name.trim()}>
            Создать и войти
          </button>
          <ErrorNote message={creating.error} onClose={() => creating.setError(null)} />
        </form>
        <div className="rr-whoami-card">
          <h3>
            <Users aria-hidden="true" /> Комнаты сервера
          </h3>
          {rooms.length === 0 ? <p className="rr-whoami-muted">Комнат пока нет — создайте первую.</p> : null}
          <ul className="rr-whoami-rooms">
            {rooms.map((room) => (
              <li key={room.id}>
                <div>
                  <b>{room.name}</b>
                  <span className="rr-whoami-muted">
                    {" "}
                    · {room.playerCount}/{room.maxPlayers} · {STATUS_LABEL[room.status]}
                    {room.status === "active" ? ` (${PHASE_LABEL[room.phase as keyof typeof PHASE_LABEL] ?? room.phase})` : ""}
                  </span>
                </div>
                <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={() => onOpenRoom(room.id)}>
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
