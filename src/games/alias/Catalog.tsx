// Обложка игры и список комнат сервера: создание комнаты, вход, сообщение о нехватке контента.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DoorOpen, Plus, Users } from "lucide-react";
import { DEFAULT_SETTINGS, LIMITS, MAX_PLAYERS, MAX_ROUNDS, MIN_PLAYERS, MIN_ROUNDS } from "../../../shared/games/alias/types";
import { createAliasApi, type CatalogInfo, type AliasApi, type RoomSummary } from "./client";
import { ErrorNote, PHASE_LABEL, FactoryBackdrop, useAction } from "./ui";

export interface AliasCatalogProps {
  serverId: string;
  onOpenRoom: (roomId: string) => void;
  api?: AliasApi;
}

const STATUS_LABEL: Record<RoomSummary["status"], string> = { lobby: "ждут игроков", active: "идёт партия", finished: "завершена", cancelled: "отменена" };

export function AliasCover() {
  return (
    <div className="rr-alias-cover">
      <img src="/games/alias/cover.svg" alt="Фабрика смыслов: конвейер с коробками слов, речевые облака и вагоны команд" width={640} height={360} />
      <div>
        <p className="rr-alias-kicker">Русский Royale · {MIN_PLAYERS}–{MAX_PLAYERS} игроков</p>
        <h2>Alias</h2>
        <p>Объясняйте термины русского языка, не называя их, и собирайте смысл в речевых облаках. Каждое угаданное слово уезжает в вагон вашей команды.</p>
      </div>
    </div>
  );
}

export function AliasCatalog({ serverId, onOpenRoom, api }: AliasCatalogProps) {
  const client = useMemo(() => api ?? createAliasApi(), [api]);
  const [info, setInfo] = useState<CatalogInfo | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("Фабрика смыслов");
  const [rounds, setRounds] = useState(DEFAULT_SETTINGS.rounds);
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
      const created = await client.createRoom(serverId, name, { ...DEFAULT_SETTINGS, rounds });
      onOpenRoom(created.roomId);
    });
  };

  return (
    <section className="rr-game-alias rr-alias-catalog" aria-labelledby="rr-alias-catalog-title">
      <FactoryBackdrop />
      <h1 id="rr-alias-catalog-title" className="rr-alias-sr">
        Alias — каталог комнат
      </h1>
      <AliasCover />
      {info && !info.enoughContent ? (
        <div className="rr-alias-card rr-alias-warning" role="status">
          <h3>Игра пока недоступна</h3>
          <p>Опубликовано меньше 30 карточек. Комнату создать можно, но начать партию получится после публикации контента редактором.</p>
        </div>
      ) : null}
      <ErrorNote message={loadError} onClose={() => setLoadError(null)} />
      <div className="rr-alias-layout">
        <form className="rr-alias-card rr-alias-form" onSubmit={create}>
          <h3>
            <Plus aria-hidden="true" /> Новая комната
          </h3>
          <label htmlFor="rr-alias-room-name">Название</label>
          <input id="rr-alias-room-name" value={name} maxLength={LIMITS.roomNameChars} onChange={(event) => setName(event.target.value)} required />
          <label htmlFor="rr-alias-room-rounds">Кругов (каждая команда получает столько ходов)</label>
          <select id="rr-alias-room-rounds" value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>
            {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => MIN_ROUNDS + i).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button type="submit" className="rr-alias-btn rr-alias-btn--accent" disabled={creating.busy || !name.trim()}>
            Создать и войти
          </button>
          <ErrorNote message={creating.error} onClose={() => creating.setError(null)} />
        </form>
        <div className="rr-alias-card">
          <h3>
            <Users aria-hidden="true" /> Комнаты сервера
          </h3>
          {rooms.length === 0 ? <p className="rr-alias-muted">Комнат пока нет — создайте первую.</p> : null}
          <ul className="rr-alias-rooms">
            {rooms.map((room) => (
              <li key={room.id}>
                <div>
                  <b>{room.name}</b>
                  <span className="rr-alias-muted">
                    {" "}
                    · {room.playerCount}/{room.maxPlayers} · {STATUS_LABEL[room.status]}
                    {room.status === "active" ? ` (${PHASE_LABEL[room.phase as keyof typeof PHASE_LABEL] ?? room.phase})` : ""}
                  </span>
                </div>
                <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={() => onOpenRoom(room.id)}>
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
