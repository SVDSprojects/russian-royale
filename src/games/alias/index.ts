// Клиентская точка входа модуля «Alias» (RR Game Module v1).
import "./styles.css";

export { Game } from "./Game";
export { Lobby } from "./Lobby";
export { AdminPanel, type AdminApi, type AdminPanelProps } from "./AdminPanel";
export { AliasRoom, type AliasRoomProps } from "./Room";
export { AliasCatalog, AliasCover, type AliasCatalogProps } from "./Catalog";
export { createAliasApi, createUpdatesSubscribe, useAliasRoom, ApiError, API_BASE, type Connection, type AliasApi, type RoomResponse, type Subscribe } from "./client";
export type { GameProps } from "./props";

export const meta = {
  gameId: "alias",
  title: "Alias",
  minPlayers: 4,
  maxPlayers: 16,
  cover: "/games/alias/cover.svg",
  icon: "/games/alias/icon.svg",
  route: (roomId: string) => `#games/alias/${encodeURIComponent(roomId)}`,
} as const;
