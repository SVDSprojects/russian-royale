// Контракт RR Game Module v1 для игры «Кто я».
// Общие типы и строгие runtime-валидаторы: используются сервером, клиентом и тестами.
// Файл не содержит игрового контента и правильных ответов.

export const GAME_ID = "whoami" as const;
export const GAME_TITLE = "Кто я";
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const TIMINGS = {
  assignMs: 8_000,
  askMs: 25_000,
  voteMs: 15_000,
  guessMs: 15_000,
  nextTurnMs: 4_000,
  matchMs: 20 * 60_000,
} as const;

export const PRESENCE = {
  onlineWindowMs: 20_000,
  hostAbsentMs: 45_000,
  allAbsentMs: 600_000,
} as const;

export const LIMITS = {
  questionChars: 180,
  guessChars: 80,
  maxPersonalTurns: 8,
  roomNameChars: 60,
  usernameChars: 40,
  termChars: 60,
  definitionChars: 600,
  answersPerTerm: 12,
  answerChars: 60,
  categoryChars: 40,
  maxAdvanceSteps: 1_000,
} as const;

export const SCORE = { base: 100, step: 10, floor: 20 } as const;

export type Phase = "lobby" | "assign" | "asking" | "peerVote" | "guessing" | "nextTurn" | "finished" | "cancelled";

export type Difficulty = 1 | 2 | 3;
export type DifficultySetting = "any" | "easy" | "medium" | "hard";

export interface Settings {
  /** Какие термины участвуют в раздаче. */
  difficulty: DifficultySetting;
}

export const DEFAULT_SETTINGS: Settings = { difficulty: "any" };

export const DIFFICULTY_OF: Record<Exclude<DifficultySetting, "any">, Difficulty> = { easy: 1, medium: 2, hard: 3 };

export interface Term {
  id: string;
  revision: number;
  term: string;
  definition: string;
  /** Допустимые варианты помимо самого термина. Хранятся только на сервере. */
  acceptedAnswers: string[];
  difficulty: Difficulty;
  category: string;
  /** Разрешить считать ё и е одной буквой при сравнении ответа. */
  equivalenceYo: boolean;
}

export type ContentStatus = "draft" | "published";

/** Снимок опубликованного контента, фиксируемый в состоянии матча. */
export interface Content {
  takenAt: number;
  terms: Term[];
}

export interface Participant {
  id: string;
  username: string;
  joinedAt: number;
  ready: boolean;
  online: boolean;
  left: boolean;
}

export type Answer = "yes" | "no" | "ambiguous";

export interface Tally {
  yes: number;
  no: number;
  ambiguous: number;
}

export interface Card {
  playerId: string;
  termId: string;
  solved: boolean;
  /** Завершённые личные ходы. */
  turnsTaken: number;
  score: number;
}

export interface TurnRecord {
  seq: number;
  askerId: string;
  turnNumber: number;
  question: string | null;
  votes: Record<string, Answer>;
  tally: Tally | null;
  answer: Answer | null;
  guess: { text: string; correct: boolean } | null;
  skipped: boolean;
  timedOut: "ask" | "guess" | "limit" | null;
  startedAt: number;
}

export interface Match {
  cards: Card[];
  order: string[];
  /** Индекс текущего (или последнего) спрашивающего в order. */
  cursor: number;
  turn: TurnRecord | null;
  history: TurnRecord[];
  startedAt: number;
  endsAt: number;
}

export interface Score {
  userId: string;
  score: number;
}

export interface Outcome {
  scores: Score[];
  winnerIds: string[];
  draw: boolean;
}

/** Секретное серверное состояние. Никогда не отдаётся клиенту целиком. */
export interface State {
  kind: "rr-whoami-state";
  schema: 1;
  sessionId: string;
  hostId: string;
  settings: Settings;
  phase: Phase;
  phaseStartedAt: number;
  deadline: number | null;
  participants: Participant[];
  content: Content;
  previousTermIds: string[];
  match: Match | null;
  outcome: Outcome | null;
  cancelReason: string | null;
  seq: number;
}

/** Игровые действия: POST /rooms/:id/actions. */
export type GameAction =
  | { type: "ask"; text: string }
  | { type: "answer"; answer: Answer }
  | { type: "guess"; text: string }
  | { type: "skipGuess" }
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

/** Табличка игрока. Для своей неугаданной таблички term и category — null. */
export interface ViewCard {
  playerId: string;
  term: string | null;
  category: string | null;
  definition: string | null;
  hidden: boolean;
  solved: boolean;
  turnsTaken: number;
  score: number | null;
}

export interface ViewTurn {
  seq: number;
  askerId: string;
  turnNumber: number;
  question: string | null;
  votedIds: string[];
  myAnswer: Answer | null;
  tally: Tally | null;
  answer: Answer | null;
  guess: { text: string; correct: boolean } | null;
  skipped: boolean;
  timedOut: TurnRecord["timedOut"];
}

/** Разрешённая проекция состояния для конкретного зрителя. */
export interface View {
  kind: "rr-whoami-view";
  sessionId: string;
  phase: Phase;
  viewerId: string;
  isParticipant: boolean;
  hostId: string;
  settings: Settings;
  phaseStartedAt: number;
  deadline: number | null;
  matchEndsAt: number | null;
  participants: ViewParticipant[];
  minPlayers: number;
  maxPlayers: number;
  maxTurns: number;
  contentCount: number;
  startBlockers: string[];
  cards: ViewCard[];
  turn: ViewTurn | null;
  history: ViewTurn[];
  outcome: Outcome | null;
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

const DIFFICULTY_SETTINGS: readonly DifficultySetting[] = ["any", "easy", "medium", "hard"];
const ANSWERS: readonly Answer[] = ["yes", "no", "ambiguous"];

export function parseSettings(value: unknown): Parsed<Settings> {
  if (value === undefined) return ok({ ...DEFAULT_SETTINGS });
  if (!isRecord(value)) return fail("Настройки: ожидается объект");
  const extra = onlyKeys(value, ["difficulty"]);
  if (extra) return fail(extra);
  const difficulty = value.difficulty ?? DEFAULT_SETTINGS.difficulty;
  if (typeof difficulty !== "string" || !(DIFFICULTY_SETTINGS as readonly string[]).includes(difficulty)) {
    return fail("Настройки: сложность any, easy, medium или hard");
  }
  return ok({ difficulty: difficulty as DifficultySetting });
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
    case "rematch":
    case "skipGuess": {
      const extra = onlyKeys(value, ["type"]);
      if (extra) return fail(extra);
      return ok({ type: value.type });
    }
    case "ask":
    case "guess": {
      const extra = onlyKeys(value, ["type", "text"]);
      if (extra) return fail(extra);
      if (typeof value.text !== "string") return fail("Текст: ожидается строка");
      const max = value.type === "ask" ? LIMITS.questionChars : LIMITS.guessChars;
      if (value.text.length > max * 2) return fail(`Текст: максимум ${max} симв.`);
      return ok({ type: value.type, text: value.text });
    }
    case "answer": {
      const extra = onlyKeys(value, ["type", "answer"]);
      if (extra) return fail(extra);
      if (typeof value.answer !== "string" || !(ANSWERS as readonly string[]).includes(value.answer)) return fail("Ответ: yes, no или ambiguous");
      return ok({ type: "answer", answer: value.answer as Answer });
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

/** Строгая проверка структуры термина. id и revision назначает сервер. Пустое определение допустимо в черновике. */
export function parseTerm(value: unknown): Parsed<Term> {
  if (!isRecord(value)) return fail("Термин: ожидается объект");
  const extra = onlyKeys(value, ["id", "revision", "term", "definition", "acceptedAnswers", "difficulty", "category", "equivalenceYo"]);
  if (extra) return fail(`Термин: ${extra}`);
  const id = value.id === undefined ? "" : value.id;
  if (typeof id !== "string" || id.length > 64 || !/^[a-z0-9-]*$/.test(id)) return fail("Термин: неверный id");
  const revision = value.revision === undefined ? 0 : value.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return fail("Термин: неверная ревизия");
  const term = parseText(value.term, "Термин", 2, LIMITS.termChars);
  if (!term.ok) return term;
  const definition = parseText(value.definition ?? "", "Определение", 0, LIMITS.definitionChars);
  if (!definition.ok) return definition;
  if (!Array.isArray(value.acceptedAnswers)) return fail("Варианты ответа: ожидается список");
  if (value.acceptedAnswers.length > LIMITS.answersPerTerm) return fail(`Варианты ответа: не больше ${LIMITS.answersPerTerm}`);
  const answers: string[] = [];
  for (const entry of value.acceptedAnswers) {
    const parsed = parseText(entry, "Вариант ответа", 1, LIMITS.answerChars);
    if (!parsed.ok) return parsed;
    answers.push(parsed.value);
  }
  const difficulty = value.difficulty;
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) return fail("Сложность: 1, 2 или 3");
  const category = parseText(value.category, "Категория", 2, LIMITS.categoryChars);
  if (!category.ok) return category;
  if (typeof value.equivalenceYo !== "boolean") return fail("equivalenceYo: ожидается логическое значение");
  return ok({
    id,
    revision,
    term: term.value,
    definition: definition.value,
    acceptedAnswers: answers,
    difficulty,
    category: category.value,
    equivalenceYo: value.equivalenceYo,
  });
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
