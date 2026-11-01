// Контракт RR Game Module v1 для игры «Самозванец».
// Общие типы и строгие runtime-валидаторы: используются сервером, клиентом и тестами.
// Файл не содержит игрового контента и секретов.

export const GAME_ID = "impostor" as const;
export const GAME_TITLE = "Самозванец";
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;

export const TIMINGS = {
  dealMs: 8_000,
  exampleMs: 25_000,
  discussionMs: 90_000,
  votingMs: 30_000,
  revealMs: 12_000,
} as const;

export const PRESENCE = {
  onlineWindowMs: 20_000,
  hostAbsentMs: 45_000,
  allAbsentMs: 600_000,
} as const;

export const LIMITS = {
  exampleChars: 100,
  chatChars: 200,
  chatHistory: 80,
  chatIntervalMs: 1_000,
  roomNameChars: 60,
  usernameChars: 40,
  topicTitleChars: 60,
  topicDescriptionChars: 400,
  differenceChars: 600,
  examplesPerTopic: 12,
  exampleItemChars: 80,
  forbiddenPerTopic: 20,
  forbiddenItemChars: 40,
  maxAdvanceSteps: 500,
} as const;

export const SCORE = { winner: 100, loser: 30 } as const;
export const SKIP_TEXT = "Пропуск";

export type Phase =
  | "lobby"
  | "deal"
  | "examples"
  | "discussion"
  | "voting"
  | "reveal"
  | "finished"
  | "cancelled";

export interface Settings {
  /** Текстовый чат во время обсуждения и голосования. */
  chat: boolean;
}

export const DEFAULT_SETTINGS: Settings = { chat: true };

export interface Topic {
  title: string;
  description: string;
  examples: string[];
  /** Простой проверяемый словарь: целые слова; «*» в конце — префикс (корень). */
  forbiddenWords: string[];
}

export interface Pair {
  id: string;
  revision: number;
  title: string;
  difference: string;
  a: Topic;
  b: Topic;
}

export type ContentStatus = "draft" | "published";

/** Снимок опубликованного контента, фиксируемый в состоянии матча. */
export interface Content {
  takenAt: number;
  pairs: Pair[];
}

export interface Participant {
  id: string;
  username: string;
  joinedAt: number;
  ready: boolean;
  online: boolean;
  left: boolean;
}

export interface ExampleEntry {
  seq: number;
  round: 1 | 2;
  authorId: string;
  text: string;
  skipped: boolean;
  at: number;
}

export interface ChatEntry {
  seq: number;
  authorId: string;
  text: string;
  at: number;
}

export type Side = "a" | "b";

export interface Match {
  pairId: string;
  impostorId: string;
  /** Сторона пары, которую получает самозванец; остальные получают противоположную. */
  impostorSide: Side;
  order: string[];
  round: 1 | 2;
  turn: number;
  examples: ExampleEntry[];
  chat: ChatEntry[];
  votes: Record<string, string>;
  startedAt: number;
}

export type Winner = "majority" | "impostor";

export interface Score {
  userId: string;
  score: number;
}

export interface Outcome {
  accusedId: string | null;
  winner: Winner;
  winnerIds: string[];
  scores: Score[];
}

/** Секретное серверное состояние. Никогда не отдаётся клиенту целиком. */
export interface State {
  kind: "rr-impostor-state";
  schema: 1;
  sessionId: string;
  hostId: string;
  settings: Settings;
  phase: Phase;
  phaseStartedAt: number;
  deadline: number | null;
  participants: Participant[];
  content: Content;
  previousPairId: string | null;
  match: Match | null;
  outcome: Outcome | null;
  cancelReason: string | null;
  seq: number;
}

/** Игровые действия: POST /rooms/:id/actions. */
export type GameAction =
  | { type: "example"; text: string }
  | { type: "chat"; text: string }
  | { type: "vote"; targetId: string }
  | { type: "settings"; settings: Settings };

/** Команды комнаты: у каждой свой маршрут (/ready, /start, /leave, /rematch); client.ts выбирает его сам. */
export type RoomAction = { type: "ready"; ready: boolean } | { type: "start" } | { type: "leave" } | { type: "rematch" };

export type Action = GameAction | RoomAction;

export const ROOM_ACTION_TYPES = ["ready", "start", "leave", "rematch"] as const;

export function isRoomAction(action: Action): action is RoomAction {
  return (ROOM_ACTION_TYPES as readonly string[]).includes(action.type);
}

export interface Result {
  sessionId: string;
  winnerUserIds: string[];
  scores: Score[];
  outcome: "win" | "draw" | "cancelled";
}

export interface Ctx {
  nowMs: number;
  randomInt: (maxExclusive: number) => number;
}

export interface ViewParticipant {
  id: string;
  username: string;
  ready: boolean;
  online: boolean;
  left: boolean;
  isHost: boolean;
}

export interface ViewTopic {
  title: string;
  description: string;
}

export interface RevealTopic extends ViewTopic {
  examples: string[];
}

export interface Tally {
  targetId: string;
  count: number;
}

export interface Reveal {
  pairTitle: string;
  difference: string;
  majorityTopic: RevealTopic;
  impostorTopic: RevealTopic;
  impostorId: string;
  accusedId: string | null;
  winner: Winner;
  votes: Record<string, string>;
  tally: Tally[];
  scores: Score[];
}

/** Разрешённая проекция состояния для конкретного зрителя. */
export interface View {
  kind: "rr-impostor-view";
  sessionId: string;
  phase: Phase;
  viewerId: string;
  isParticipant: boolean;
  hostId: string;
  settings: Settings;
  phaseStartedAt: number;
  deadline: number | null;
  participants: ViewParticipant[];
  minPlayers: number;
  maxPlayers: number;
  contentCount: number;
  startBlockers: string[];
  myTopic: ViewTopic | null;
  round: 1 | 2 | null;
  order: string[];
  currentTurnId: string | null;
  examples: ExampleEntry[];
  chat: ChatEntry[];
  votedIds: string[];
  myVote: string | null;
  majorityNeeded: number;
  reveal: Reveal | null;
  cancelReason: string | null;
}

/** Нормализованный формат базового учебного задания (см. README). */
export interface BaseTask {
  id: string;
  ruleId: string;
  prompt: string;
  options: string[];
  acceptedAnswers: string[];
  explanation: string;
  difficulty: number;
  revision: number;
  status: ContentStatus;
}

// ---------- runtime-валидаторы ----------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): string | null {
  const extra = Object.keys(value).find((key) => !keys.includes(key));
  return extra === undefined ? null : `Лишнее поле «${extra}»`;
}

export function parseText(value: unknown, label: string, min: number, max: number): Parsed<string> {
  if (typeof value !== "string") return fail(`${label}: ожидается строка`);
  const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (text.length < min) return fail(min <= 1 ? `${label}: пустое значение` : `${label}: минимум ${min} симв.`);
  if (text.length > max) return fail(`${label}: максимум ${max} симв.`);
  return ok(text);
}

function parseTextList(value: unknown, label: string, maxItems: number, maxChars: number, minItems: number): Parsed<string[]> {
  if (!Array.isArray(value)) return fail(`${label}: ожидается список`);
  if (value.length > maxItems) return fail(`${label}: не больше ${maxItems} элементов`);
  const items: string[] = [];
  for (const entry of value) {
    const parsed = parseText(entry, label, 1, maxChars);
    if (!parsed.ok) return parsed;
    items.push(parsed.value);
  }
  if (items.length < minItems) return fail(`${label}: нужно минимум ${minItems}`);
  return ok(items);
}

export function parseSettings(value: unknown): Parsed<Settings> {
  if (value === undefined) return ok({ ...DEFAULT_SETTINGS });
  if (!isRecord(value)) return fail("Настройки: ожидается объект");
  const extra = onlyKeys(value, ["chat"]);
  if (extra) return fail(extra);
  const chat = value.chat ?? DEFAULT_SETTINGS.chat;
  if (typeof chat !== "boolean") return fail("Настройки: chat должен быть логическим");
  return ok({ chat });
}

/** Только игровые действия — для маршрута /actions. */
export function parseGameAction(value: unknown): Parsed<GameAction> {
  const parsed = parseAction(value);
  if (!parsed.ok) return parsed;
  if (isRoomAction(parsed.value)) return fail("Для этой команды есть отдельный маршрут комнаты");
  return ok(parsed.value);
}

export function parseAction(value: unknown): Parsed<Action> {
  if (!isRecord(value) || typeof value.type !== "string") return fail("Действие: неверный формат");
  switch (value.type) {
    case "ready": {
      const extra = onlyKeys(value, ["type", "ready"]);
      if (extra) return fail(extra);
      if (typeof value.ready !== "boolean") return fail("ready должен быть логическим");
      return ok({ type: "ready", ready: value.ready });
    }
    case "start":
    case "leave":
    case "rematch": {
      const extra = onlyKeys(value, ["type"]);
      if (extra) return fail(extra);
      return ok({ type: value.type });
    }
    case "example":
    case "chat": {
      const extra = onlyKeys(value, ["type", "text"]);
      if (extra) return fail(extra);
      if (typeof value.text !== "string") return fail("Текст: ожидается строка");
      const max = value.type === "example" ? LIMITS.exampleChars : LIMITS.chatChars;
      if (value.text.length > max * 2) return fail(`Текст: максимум ${max} симв.`);
      return ok({ type: value.type, text: value.text });
    }
    case "vote": {
      const extra = onlyKeys(value, ["type", "targetId"]);
      if (extra) return fail(extra);
      if (typeof value.targetId !== "string" || value.targetId.length === 0 || value.targetId.length > 64) {
        return fail("Голос: неверный участник");
      }
      return ok({ type: "vote", targetId: value.targetId });
    }
    case "settings": {
      const extra = onlyKeys(value, ["type", "settings"]);
      if (extra) return fail(extra);
      const settings = parseSettings(value.settings);
      if (!settings.ok) return settings;
      return ok({ type: "settings", settings: settings.value });
    }
    default:
      return fail("Неизвестное действие");
  }
}

function parseTopic(value: unknown, label: string): Parsed<Topic> {
  if (!isRecord(value)) return fail(`${label}: ожидается объект`);
  const extra = onlyKeys(value, ["title", "description", "examples", "forbiddenWords"]);
  if (extra) return fail(`${label}: ${extra}`);
  const title = parseText(value.title, `${label}, название`, 2, LIMITS.topicTitleChars);
  if (!title.ok) return title;
  const description = parseText(value.description, `${label}, описание`, 10, LIMITS.topicDescriptionChars);
  if (!description.ok) return description;
  const examples = parseTextList(value.examples, `${label}, примеры`, LIMITS.examplesPerTopic, LIMITS.exampleItemChars, 3);
  if (!examples.ok) return examples;
  const forbidden = parseTextList(value.forbiddenWords, `${label}, запретные слова`, LIMITS.forbiddenPerTopic, LIMITS.forbiddenItemChars, 1);
  if (!forbidden.ok) return forbidden;
  return ok({ title: title.value, description: description.value, examples: examples.value, forbiddenWords: forbidden.value });
}

/** Строгая проверка структуры пары. id и revision назначает сервер. */
export function parsePair(value: unknown): Parsed<Pair> {
  if (!isRecord(value)) return fail("Пара: ожидается объект");
  const extra = onlyKeys(value, ["id", "revision", "title", "difference", "a", "b"]);
  if (extra) return fail(`Пара: ${extra}`);
  const id = value.id === undefined ? "" : value.id;
  if (typeof id !== "string" || id.length > 64 || !/^[a-z0-9-]*$/.test(id)) return fail("Пара: неверный id");
  const revision = value.revision === undefined ? 0 : value.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return fail("Пара: неверная ревизия");
  const title = parseText(value.title, "Название пары", 2, LIMITS.topicTitleChars * 2);
  if (!title.ok) return title;
  const difference = parseText(value.difference, "Объяснение различия", 20, LIMITS.differenceChars);
  if (!difference.ok) return difference;
  const a = parseTopic(value.a, "Тема A");
  if (!a.ok) return a;
  const b = parseTopic(value.b, "Тема B");
  if (!b.ok) return b;
  return ok({ id, revision, title: title.value, difference: difference.value, a: a.value, b: b.value });
}

export function parseBaseTask(value: unknown): Parsed<BaseTask> {
  if (!isRecord(value)) return fail("Задание: ожидается объект");
  const { id, ruleId, prompt, options, acceptedAnswers, explanation, difficulty, revision, status } = value;
  if (typeof id !== "string" || typeof ruleId !== "string" || typeof prompt !== "string") return fail("Задание: id, ruleId, prompt — строки");
  if (!Array.isArray(options) || !options.every((o) => typeof o === "string")) return fail("Задание: options — список строк");
  if (!Array.isArray(acceptedAnswers) || !acceptedAnswers.every((o) => typeof o === "string")) return fail("Задание: acceptedAnswers — список строк");
  if (typeof explanation !== "string") return fail("Задание: explanation — строка");
  if (typeof difficulty !== "number" || typeof revision !== "number") return fail("Задание: difficulty и revision — числа");
  if (status !== "draft" && status !== "published") return fail("Задание: неверный status");
  return ok({ id, ruleId, prompt, options, acceptedAnswers, explanation, difficulty, revision, status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
