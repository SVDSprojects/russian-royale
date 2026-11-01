import type { Action, View } from "../../../shared/games/whoami/types";
import type { Connection } from "./client";

/** Пропсы Game и Lobby по контракту RR Game Module v1. */
export interface GameProps {
  view: View;
  currentUserId: string;
  send: (action: Action) => Promise<void>;
  connection: Connection;
  serverNowMs: number;
  onExit: () => void;
}
