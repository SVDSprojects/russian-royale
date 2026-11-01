// Связка компонентов с реальным HTTP API /api/games/whoami. Авторизация — cookie сайта (rr_session).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, Settings, View } from "../../../shared/games/whoami/types";

export const API_BASE = "/api/games/whoami";

export type Connection = "online" | "reconnecting" | "offline";

export interface RoomResponse {
  view: View;
  version: number;
  serverNow: number;
  roomId: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  status: "lobby" | "active" | "finished" | "cancelled";
  phase: string;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  joinable: boolean;
  updatedAt: number;
}

export interface CatalogInfo {
  gameId: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  publishedCount: number;
  enoughContent: boolean;
  serverNow: number;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const ROOM_ROUTES: Record<string, string> = { start: "start", leave: "leave", rematch: "rematch" };

export function createWhoamiApi(base: string = API_BASE, fetcher: typeof fetch = (...args) => globalThis.fetch(...args)) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(base + path, {
        credentials: "same-origin",
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      });
    } catch {
      throw new ApiError(0, "Нет связи с сервером");
    }
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Не удалось выполнить запрос";
      throw new ApiError(response.status, message);
    }
    return data as T;
  }

  const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
  const commandId = () => globalThis.crypto.randomUUID();

  return {
    catalog: () => request<CatalogInfo>("/catalog"),
    listRooms: (serverId: string) => request<{ rooms: RoomSummary[]; serverNow: number }>(`/rooms?serverId=${encodeURIComponent(serverId)}`),
    createRoom: (serverId: string, name: string, settings: Settings) =>
      post<RoomResponse>("/rooms", { serverId, name, settings, commandId: commandId(), expectedVersion: 0 }),
    view: (roomId: string) => request<RoomResponse>(`/rooms/${encodeURIComponent(roomId)}/view`),
    join: (roomId: string, expectedVersion: number) =>
      post<RoomResponse>(`/rooms/${encodeURIComponent(roomId)}/join`, { commandId: commandId(), expectedVersion }),
    /** Команды комнаты уходят на свои маршруты, игровые действия — на /actions. */
    send: (roomId: string, action: Action, expectedVersion: number) => {
      const room = `/rooms/${encodeURIComponent(roomId)}`;
      const base = { commandId: commandId(), expectedVersion };
      if (action.type === "ready") return post<RoomResponse>(`${room}/ready`, { ...base, ready: action.ready });
      const route = ROOM_ROUTES[action.type];
      if (route) return post<RoomResponse>(`${room}/${route}`, base);
      return post<RoomResponse>(`${room}/actions`, { ...base, action });
    },
  };
}

export type WhoamiApi = ReturnType<typeof createWhoamiApi>;

/** Подписка на уведомления об изменениях. На сайте — адаптер к useLive из src/api.tsx (см. README). */
export type Subscribe = (onChange: () => void) => () => void;

export interface RoomHook {
  data: RoomResponse | null;
  connection: Connection;
  error: string | null;
  refresh: () => Promise<void>;
  send: (action: Action) => Promise<void>;
  join: () => Promise<void>;
}

const HEARTBEAT_MS = 5_000;
const RETRY_MS = 2_000;

export function useWhoamiRoom(roomId: string, api: WhoamiApi, subscribe?: Subscribe): RoomHook {
  const [data, setData] = useState<RoomResponse | null>(null);
  const [connection, setConnection] = useState<Connection>("online");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<RoomResponse | null>(null);
  const failures = useRef(0);

  const accept = useCallback((next: RoomResponse) => {
    const current = latest.current;
    const sameSession = current?.view.sessionId === next.view.sessionId;
    if (current && sameSession && next.version < current.version) return;
    latest.current = next;
    failures.current = 0;
    setData(next);
    setConnection("online");
    setError(null);
  }, []);

  const lostConnection = useCallback(() => {
    failures.current += 1;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    setConnection(offline || failures.current >= 3 ? "offline" : "reconnecting");
  }, []);

  const refresh = useCallback(async () => {
    try {
      accept(await api.view(roomId));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status !== 0) {
        setError(caught.message);
        return;
      }
      lostConnection();
    }
  }, [accept, api, lostConnection, roomId]);

  useEffect(() => {
    latest.current = null;
    setData(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const delay = connection === "online" ? HEARTBEAT_MS : RETRY_MS;
    const timer = setInterval(() => void refresh(), delay);
    return () => clearInterval(timer);
  }, [connection, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    const onOffline = () => setConnection("offline");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  useEffect(() => (subscribe ? subscribe(() => void refresh()) : undefined), [refresh, subscribe]);

  const run = useCallback(
    async (operation: (version: number) => Promise<RoomResponse>) => {
      const current = latest.current;
      if (!current) throw new Error("Комната ещё загружается");
      try {
        accept(await operation(current.version));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          // Устаревший ход не повторяется автоматически: обновляем экран и просим повторить.
          await refresh();
          throw new Error(caught.message);
        }
        if (caught instanceof ApiError && caught.status === 0) {
          lostConnection();
          throw new Error("Нет связи — действие не отправлено. Повторите, когда связь восстановится");
        }
        throw caught instanceof Error ? caught : new Error("Не удалось выполнить действие");
      }
    },
    [accept, lostConnection, refresh],
  );

  const send = useCallback((action: Action) => run((version) => api.send(roomId, action, version)), [api, roomId, run]);
  const join = useCallback(() => run((version) => api.join(roomId, version)), [api, roomId, run]);

  return { data, connection, error, refresh, send, join };
}

/** Long polling /api/updates?after=… — как на сайте. Используется в preview и как пример адаптера. */
export function createUpdatesSubscribe(url = "/api/updates", fetcher: typeof fetch = (...args) => globalThis.fetch(...args)): Subscribe {
  return (onChange) => {
    let stopped = false;
    let after = 0;
    const controller = new AbortController();
    const loop = async () => {
      while (!stopped) {
        try {
          const response = await fetcher(`${url}?after=${after}`, { credentials: "same-origin", signal: controller.signal });
          const data = (await response.json()) as { seq?: number };
          const seq = typeof data.seq === "number" ? data.seq : after;
          if (seq !== after) {
            after = seq;
            onChange();
          }
        } catch {
          if (stopped) return;
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
      controller.abort();
    };
  };
}
