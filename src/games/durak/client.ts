import { ViewSchema, SettingsSchema } from "../../../shared/games/durak/types";
import type { Action, Settings } from "../../../shared/games/durak/types";
import { z } from "zod";
export const RoomViewSchema = z
  .object({
    roomId: z.string(),
    serverId: z.string(),
    name: z.string(),
    hostId: z.string(),
    settings: SettingsSchema,
    members: z.array(
      z
        .object({
          id: z.string(),
          username: z.string(),
          ready: z.boolean(),
          online: z.boolean(),
        })
        .strict(),
    ),
    game: ViewSchema.nullable(),
  })
  .strict();
const EnvelopeSchema = z
  .object({
    view: RoomViewSchema,
    version: z.number().int(),
    serverNow: z.number(),
  })
  .strict();
export type RoomView = z.infer<typeof RoomViewSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type API = (path: string, options?: RequestInit) => Promise<unknown>;
export class HTTPError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const http: API = async (path, options) => {
  const r = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const b: unknown = await r.json();
  if (!r.ok)
    throw new HTTPError(
      r.status,
      z.object({ error: z.string() }).safeParse(b).data?.error ??
        "Ошибка запроса",
    );
  return b;
};
const base = "/api/games/durak";
export class DurakClient {
  version = 0;
  private latest: Envelope | null = null;
  private accept(b: Envelope) {
    if (this.latest && b.version < this.latest.version) return this.latest;
    this.version = b.version;
    this.latest = b;
    return b;
  }
  constructor(
    public roomId: string,
    public api: API = http,
  ) {}
  async view() {
    const b = EnvelopeSchema.parse(
      await this.api(`${base}/rooms/${this.roomId}/view`),
    );
    return this.accept(b);
  }
  async command(path: string, data: Record<string, unknown> = {}) {
    try {
      const b = EnvelopeSchema.parse(
        await this.api(`${base}/rooms/${this.roomId}/${path}`, {
          method: "POST",
          body: JSON.stringify({
            ...data,
            commandId: crypto.randomUUID(),
            expectedVersion: this.version,
          }),
        }),
      );
      return this.accept(b);
    } catch (e) {
      if (e instanceof HTTPError && e.status === 409) await this.view();
      throw e;
    }
  }
  send = (action: Action) => this.command("actions", { action });
  static async create(
    serverId: string,
    name: string,
    settings: Settings,
    api: API = http,
  ) {
    return EnvelopeSchema.parse(
      await api(`${base}/rooms`, {
        method: "POST",
        body: JSON.stringify({
          serverId,
          name,
          settings,
          commandId: crypto.randomUUID(),
          expectedVersion: 0,
        }),
      }),
    );
  }
  static async list(serverId: string, api: API = http) {
    return z
      .object({
        rooms: z.array(
          z.object({
            id: z.string(),
            version: z.number().int(),
            name: z.string(),
            count: z.number(),
            maxPlayers: z.number(),
            phase: z.string(),
            joined: z.boolean(),
          }),
        ),
      })
      .parse(
        await api(`${base}/rooms?serverId=${encodeURIComponent(serverId)}`),
      ).rooms;
  }
}
// В production передайте сюда функцию подписки-обёртку над существующим useLive.
// Событие содержит только сигнал обновления, после него читается разрешённый View.
export function subscribeDurakLive(
  subscribe: (callback: () => void) => () => void,
  reload: () => void,
) {
  return subscribe(reload);
}
