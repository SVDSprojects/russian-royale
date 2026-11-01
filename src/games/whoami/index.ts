// Клиентская точка входа модуля «Кто я» (RR Game Module v1).
import "./styles.css";

export { Game } from "./Game";
export { Lobby } from "./Lobby";
export { AdminPanel, type AdminApi, type AdminPanelProps } from "./AdminPanel";
export { WhoamiRoom, type WhoamiRoomProps } from "./Room";
export { WhoamiCatalog, WhoamiCover, type WhoamiCatalogProps } from "./Catalog";
export { createWhoamiApi, createUpdatesSubscribe, useWhoamiRoom, ApiError, API_BASE, type Connection, type WhoamiApi, type RoomResponse, type Subscribe } from "./client";
export type { GameProps } from "./props";

export const meta = {
  gameId: "whoami",
  title: "Кто я",
  minPlayers: 3,
  maxPlayers: 12,
  cover: "/games/whoami/cover.svg",
  icon: "/games/whoami/icon.svg",
  route: (roomId: string) => `#games/whoami/${encodeURIComponent(roomId)}`,
} as const;
