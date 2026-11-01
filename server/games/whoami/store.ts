// Доступ к таблицам rr_whoami_*. Все параметры связываются, имена таблиц фиксированы.

import type { DB } from "../../storage";
import type { ContentStatus, Phase, Result, State } from "../../../shared/games/whoami/types";
import type { Item } from "./content";

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | undefined {
  return typeof value === "object" && value !== null ? (value as Row) : undefined;
}

const str = (row: Row, key: string): string => String(row[key] ?? "");
const num = (row: Row, key: string): number => Number(row[key] ?? 0);
const numOrNull = (row: Row, key: string): number | null => (row[key] === null || row[key] === undefined ? null : Number(row[key]));

export type RoomStatus = "lobby" | "active" | "finished" | "cancelled";

export interface RoomRow {
  id: string;
  serverId: string;
  name: string;
  hostId: string;
  sessionId: string;
  version: number;
  status: RoomStatus;
  phase: Phase;
  playerCount: number;
  deadlineMs: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

function toRoom(row: Row): RoomRow {
  return {
    id: str(row, "id"),
    serverId: str(row, "server_id"),
    name: str(row, "name"),
    hostId: str(row, "host_id"),
    sessionId: str(row, "session_id"),
    version: num(row, "version"),
    status: str(row, "status") as RoomStatus,
    phase: str(row, "phase") as Phase,
    playerCount: num(row, "player_count"),
    deadlineMs: numOrNull(row, "deadline_ms"),
    createdBy: str(row, "created_by"),
    createdAt: num(row, "created_at"),
    updatedAt: num(row, "updated_at"),
  };
}

export interface ContentRow {
  id: string;
  status: ContentStatus;
  revision: number;
  item: Item;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export function statusOf(phase: Phase): RoomStatus {
  if (phase === "lobby") return "lobby";
  if (phase === "finished") return "finished";
  if (phase === "cancelled") return "cancelled";
  return "active";
}

export class Store {
  private readonly db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  /** Членство в исходном сервере сайта. Единственное место, где читается общая таблица. */
  isServerMember(serverId: string, userId: string): boolean {
    const row = this.db.prepare("SELECT 1 AS ok FROM server_members WHERE server_id = ? AND user_id = ?").get(serverId, userId);
    return asRow(row) !== undefined;
  }

  getRoom(id: string): RoomRow | undefined {
    const row = asRow(this.db.prepare("SELECT * FROM rr_whoami_rooms WHERE id = ?").get(id));
    return row ? toRoom(row) : undefined;
  }

  listRooms(serverId: string, sinceMs: number): RoomRow[] {
    return this.db
      .prepare(
        "SELECT * FROM rr_whoami_rooms WHERE server_id = ? AND status IN ('lobby', 'active', 'finished') AND updated_at >= ? ORDER BY updated_at DESC LIMIT 50",
      )
      .all(serverId, sinceMs)
      .map((row) => toRoom(asRow(row) ?? {}));
  }

  activeRooms(): RoomRow[] {
    return this.db
      .prepare("SELECT * FROM rr_whoami_rooms WHERE status IN ('lobby', 'active') ORDER BY updated_at")
      .all()
      .map((row) => toRoom(asRow(row) ?? {}));
  }

  earliestDeadline(): number | null {
    const row = asRow(this.db.prepare("SELECT MIN(deadline_ms) AS d FROM rr_whoami_rooms WHERE status = 'active'").get());
    return row ? numOrNull(row, "d") : null;
  }

  countActive(): number {
    const row = asRow(this.db.prepare("SELECT COUNT(*) AS c FROM rr_whoami_rooms WHERE status = 'active'").get());
    return row ? num(row, "c") : 0;
  }

  insertRoom(room: RoomRow): void {
    this.db
      .prepare(
        `INSERT INTO rr_whoami_rooms (id, server_id, name, host_id, session_id, version, status, phase, player_count, deadline_ms, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        room.id,
        room.serverId,
        room.name,
        room.hostId,
        room.sessionId,
        room.version,
        room.status,
        room.phase,
        room.playerCount,
        room.deadlineMs,
        room.createdBy,
        room.createdAt,
        room.updatedAt,
      );
  }

  /** Оптимистичная запись: обновляет комнату только с ожидаемой версией. */
  updateRoom(room: RoomRow, previousVersion: number): void {
    const info = this.db
      .prepare(
        `UPDATE rr_whoami_rooms SET host_id = ?, session_id = ?, version = ?, status = ?, phase = ?, player_count = ?, deadline_ms = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .run(room.hostId, room.sessionId, room.version, room.status, room.phase, room.playerCount, room.deadlineMs, room.updatedAt, room.id, previousVersion);
    if (Number(info.changes) !== 1) throw new Error("Конфликт версии комнаты");
  }

  getState(sessionId: string): State | undefined {
    const row = asRow(this.db.prepare("SELECT state_json FROM rr_whoami_sessions WHERE id = ?").get(sessionId));
    if (!row) return undefined;
    const parsed: unknown = JSON.parse(str(row, "state_json"));
    if (typeof parsed !== "object" || parsed === null || (parsed as { kind?: unknown }).kind !== "rr-whoami-state") {
      throw new Error("Повреждённое состояние партии");
    }
    return parsed as State;
  }

  insertSession(sessionId: string, roomId: string, serverId: string, state: State, now: number): void {
    this.db
      .prepare("INSERT INTO rr_whoami_sessions (id, room_id, server_id, state_json, phase, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(sessionId, roomId, serverId, JSON.stringify(state), state.phase, now, now);
  }

  saveState(sessionId: string, state: State, now: number): void {
    this.db.prepare("UPDATE rr_whoami_sessions SET state_json = ?, phase = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), state.phase, now, sessionId);
  }

  upsertMember(roomId: string, serverId: string, userId: string, username: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO rr_whoami_members (room_id, user_id, server_id, username, joined_at, last_seen_ms, left_at) VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(room_id, user_id) DO UPDATE SET username = excluded.username, last_seen_ms = excluded.last_seen_ms, left_at = NULL`,
      )
      .run(roomId, userId, serverId, username, now, now);
  }

  markLeft(roomId: string, userId: string, now: number): void {
    this.db.prepare("UPDATE rr_whoami_members SET left_at = ? WHERE room_id = ? AND user_id = ?").run(now, roomId, userId);
  }

  touch(roomId: string, userId: string, now: number): void {
    this.db.prepare("UPDATE rr_whoami_members SET last_seen_ms = ? WHERE room_id = ? AND user_id = ?").run(now, roomId, userId);
  }

  lastSeen(roomId: string): Record<string, number> {
    const seen: Record<string, number> = {};
    for (const raw of this.db.prepare("SELECT user_id, last_seen_ms FROM rr_whoami_members WHERE room_id = ?").all(roomId)) {
      const row = asRow(raw);
      if (row) seen[str(row, "user_id")] = num(row, "last_seen_ms");
    }
    return seen;
  }

  findCommand(userId: string, commandId: string): { roomId: string; versionAfter: number } | undefined {
    const row = asRow(this.db.prepare("SELECT room_id, version_after FROM rr_whoami_commands WHERE user_id = ? AND command_id = ?").get(userId, commandId));
    return row ? { roomId: str(row, "room_id"), versionAfter: num(row, "version_after") } : undefined;
  }

  insertCommand(userId: string, commandId: string, roomId: string, versionAfter: number, now: number): void {
    this.db
      .prepare("INSERT INTO rr_whoami_commands (user_id, command_id, room_id, version_after, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, commandId, roomId, versionAfter, now);
  }

  pruneCommands(beforeMs: number): void {
    this.db.prepare("DELETE FROM rr_whoami_commands WHERE created_at < ?").run(beforeMs);
  }

  hasResult(sessionId: string): boolean {
    return asRow(this.db.prepare("SELECT 1 AS ok FROM rr_whoami_results WHERE session_id = ?").get(sessionId)) !== undefined;
  }

  /** Сохраняет результат ровно один раз: повторный вызов ничего не начисляет. */
  insertResult(result: Result, roomId: string, serverId: string, now: number): boolean {
    const info = this.db
      .prepare("INSERT OR IGNORE INTO rr_whoami_results (session_id, room_id, server_id, outcome, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(result.sessionId, roomId, serverId, result.outcome, JSON.stringify(result), now);
    if (Number(info.changes) !== 1) return false;
    const insertScore = this.db.prepare(
      "INSERT OR IGNORE INTO rr_whoami_scores (session_id, user_id, server_id, score, is_winner, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const score of result.scores) {
      insertScore.run(result.sessionId, score.userId, serverId, score.score, result.winnerUserIds.includes(score.userId) ? 1 : 0, now);
    }
    return true;
  }

  getResult(sessionId: string): Result | undefined {
    const row = asRow(this.db.prepare("SELECT result_json FROM rr_whoami_results WHERE session_id = ?").get(sessionId));
    return row ? (JSON.parse(str(row, "result_json")) as Result) : undefined;
  }

  // ---------- контент ----------

  listContent(): ContentRow[] {
    return this.db
      .prepare("SELECT * FROM rr_whoami_content ORDER BY created_at, id")
      .all()
      .map((raw) => this.toContent(asRow(raw) ?? {}));
  }

  publishedItems(): Item[] {
    return this.db
      .prepare("SELECT * FROM rr_whoami_content WHERE status = 'published' ORDER BY id")
      .all()
      .map((raw) => this.toContent(asRow(raw) ?? {}).item);
  }

  countPublished(): number {
    const row = asRow(this.db.prepare("SELECT COUNT(*) AS c FROM rr_whoami_content WHERE status = 'published'").get());
    return row ? num(row, "c") : 0;
  }

  getContent(id: string): ContentRow | undefined {
    const row = asRow(this.db.prepare("SELECT * FROM rr_whoami_content WHERE id = ?").get(id));
    return row ? this.toContent(row) : undefined;
  }

  insertContent(row: ContentRow): void {
    this.db
      .prepare("INSERT INTO rr_whoami_content (id, status, revision, data_json, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(row.id, row.status, row.revision, JSON.stringify(row.item), row.createdAt, row.updatedAt, row.updatedBy);
  }

  updateContent(row: ContentRow, previousRevision: number): boolean {
    const info = this.db
      .prepare("UPDATE rr_whoami_content SET status = ?, revision = ?, data_json = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?")
      .run(row.status, row.revision, JSON.stringify(row.item), row.updatedAt, row.updatedBy, row.id, previousRevision);
    return Number(info.changes) === 1;
  }

  deleteContent(id: string, revision: number): boolean {
    const info = this.db.prepare("DELETE FROM rr_whoami_content WHERE id = ? AND revision = ?").run(id, revision);
    return Number(info.changes) === 1;
  }

  private toContent(row: Row): ContentRow {
    return {
      id: str(row, "id"),
      status: str(row, "status") === "published" ? "published" : "draft",
      revision: num(row, "revision"),
      item: JSON.parse(str(row, "data_json")) as Item,
      createdAt: num(row, "created_at"),
      updatedAt: num(row, "updated_at"),
      updatedBy: str(row, "updated_by"),
    };
  }
}
