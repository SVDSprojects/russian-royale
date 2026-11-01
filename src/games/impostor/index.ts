// Клиентская точка входа модуля «Самозванец» (RR Game Module v1).
import "./styles.css";

export { Game } from "./Game";
export { Lobby } from "./Lobby";
export { AdminPanel, type AdminApi, type AdminPanelProps } from "./AdminPanel";
export { ImpostorRoom, type ImpostorRoomProps } from "./Room";
export { ImpostorCatalog, ImpostorCover, type ImpostorCatalogProps } from "./Catalog";
export { createImpostorApi, createUpdatesSubscribe, useImpostorRoom, ApiError, API_BASE, type Connection, type ImpostorApi, type RoomResponse, type Subscribe } from "./client";
export type { GameProps } from "./props";

export const meta = {
  gameId: "impostor",
  title: "Самозванец",
  minPlayers: 4,
  maxPlayers: 16,
  cover: "/games/impostor/cover.svg",
  icon: "/games/impostor/icon.svg",
  route: (roomId: string) => `#games/impostor/${encodeURIComponent(roomId)}`,
} as const;
