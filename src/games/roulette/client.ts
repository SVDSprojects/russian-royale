import {
  EnvelopeSchema,
  type Envelope,
  type Action,
  type Settings,
  type Content,
} from "../../../shared/games/roulette/types";
const base = "/api/games/roulette";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Api = (path: string, options?: RequestInit) => Promise<unknown>;
export const api: Api = async (path, options) => {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Ошибка запроса";
    throw new HttpError(response.status, message);
  }
  return data;
};
export function roomClient(
  roomId: string,
  onUpdate: (data: Envelope) => void,
  request: Api = api,
) {
  let current: Envelope | null = null;
  let refreshing: Promise<void> | null = null;
  const accept = (value: unknown) => {
    const parsed = EnvelopeSchema.parse(value);
    if (!current || parsed.version >= current.version) {
      current = parsed;
      onUpdate(parsed);
    }
  };
  const refresh = (): Promise<void> => {
    if (!refreshing)
      refreshing = request(
        base + "/rooms/" + encodeURIComponent(roomId) + "/view",
      )
        .then(accept)
        .finally(() => {
          refreshing = null;
        });
    return refreshing;
  };
  async function command(kind: string, extra: object = {}) {
    if (!current) await refresh();
    try {
      const value = await request(
        base + "/rooms/" + encodeURIComponent(roomId) + "/" + kind,
        {
          method: "POST",
          body: JSON.stringify({
            ...extra,
            commandId: crypto.randomUUID(),
            expectedVersion: current!.version,
          }),
        },
      );
      if (kind !== "leave") accept(value);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        await refresh();
        throw new HttpError(
          409,
          "Состояние обновлено. Проверьте экран и повторите действие вручную",
        );
      }
      throw error;
    }
  }
  return {
    refresh,
    send: (action: Action) =>
      action.type === "ready"
        ? command("ready", { ready: action.ready })
        : action.type === "start"
          ? command("start")
          : action.type === "rematch"
            ? command("rematch")
            : command("actions", { action }),
    leave: () => command("leave"),
  };
}
export const createRoom = (
  serverId: string,
  name: string,
  settings: Settings,
  request: Api = api,
) =>
  request(base + "/rooms", {
    method: "POST",
    body: JSON.stringify({
      serverId,
      name,
      settings,
      commandId: crypto.randomUUID(),
      expectedVersion: 0,
    }),
  });
export const joinRoom = (roomId: string, version: number, request: Api = api) =>
  request(base + "/rooms/" + roomId + "/join", {
    method: "POST",
    body: JSON.stringify({
      commandId: crypto.randomUUID(),
      expectedVersion: version,
    }),
  });
export type ContentList = { content: Pick<Content, "id" | "title">[] };
