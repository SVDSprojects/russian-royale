// Контракт RR Game Module v1 для игры «Alias».
// Общие типы и строгие runtime-валидаторы: используются сервером, клиентом и тестами.
// Файл не содержит игрового контента и секретов.

export const GAME_ID = "alias" as const;
export const GAME_TITLE = "Alias";
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 16;
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;
export const MIN_TEAM_SIZE = 2;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 8;
export const MIN_CARDS = 30;

export const TIMINGS = {
  prepareMs: 5_000,
  explainMs: 60_000,
  turnResultMs: 6_000,
} as const;

export const PRESENCE = {
  onlineWindowMs: 20_000,
  hostAbsentMs: 45_000,
  allAbsentMs: 600_000,
} as const;

export const LIMITS = {
  explanationChars: 300,
  guessChars: 100,
  guessIntervalMs: 800,
  explanationIntervalMs: 300,
  roomNameChars: 60,
  usernameChars: 40,
  termChars: 60,
  definitionChars: 400,
  categoryChars: 40,
  answersPerCard: 10,
  phrasesPerCard: 20,
  formsPerCard: 20,
  itemChars: 60,
  feedHistory: 60,
  maxAdvanceSteps: 2_000,
} as const;

/** Названия, формы значков и цвета команд: у каждой команды своя форма, а не только цвет. */
export const TEAMS = [
  { name: "Шестерёнки", shape: "gear", color: "#D63970" },
  { name: "Пружины", shape: "triangle", color: "#B8E8FF" },
  { name: "Болты", shape: "square", color: "#FFF3C4" },
  { name: "Рычаги", shape: "hexagon", color: "#F0A6C2" },
] as const;

export type TeamShape = (typeof TEAMS)[number]["shape"];

export type Phase = "lobby" | "prepare" | "explaining" | "turnResult" | "finished" | "cancelled";

export interface Settings {
  teamCount: number;
  rounds: number;
}

export const DEFAULT_SETTINGS: Settings = { teamCount: 2, rounds: 4 };

export type ContentStatus = "draft" | "published";

export interface Card {
  id: string;
  revision: number;
  term: string;
  acceptedAnswers: string[];
  /** Фразы, которые нельзя использовать в объяснении (целые слова; «*» в конце — корень). */
  forbiddenPhrases: string[];
  /** Формы и корни самого термина, заданные редактором (морфологии нет). */
  forbiddenForms: string[];
  definition: string;
  difficulty: 1 | 2 | 3;
  category: string;
}

/** Снимок опубликованного контента, фиксируемый в состоянии матча. */
export interface Content {
  takenAt: number;
  cards: Card[];
}

export interface Participant {
  id: string;
  username: string;
  joinedAt: number;
  ready: boolean;
  online: boolean;
  left: boolean;
  team: number;
}

export interface TeamState {
  score: number;
  turnsPlayed: number;
}

export type CardOutcome = "pending" | "guessed" | "skipped" | "expired";

export interface TurnCard {
  seq: number;
  cardId: string;
  outcome: CardOutcome;
  guessedBy: string | null;
  at: number;
}

export interface Explanation {
  seq: number;
  authorId: string;
  cardSeq: number;
  text: string;
  at: number;
}

export interface Guess {
  seq: number;
  authorId: string;
  cardSeq: number;
  text: string;
  correct: boolean;
  at: number;
}

export type TurnEnd = "timer" | "deck" | "explainerLeft" | "noExplainer";

export interface Turn {
  number: number;
  round: number;
  team: number;
  explainerId: string | null;
  startedAt: number;
  cards: TurnCard[];
  explanations: Explanation[];
  guesses: Guess[];
  scoreDelta: number;
  endedBy: TurnEnd | null;
}

export interface Match {
  /** Оставшиеся id карточек в порядке выдачи. Пустая колода перемешивается заново в начале следующего хода. */
  deck: string[];
  turns: Turn[];
  cardCounter: number;
  lastGuessAt: Record<string, number>;
  lastExplanationAt: number;
  startedAt: number;
}

export interface Score {
  userId: string;
  score: number;
}

export interface Outcome {
  teamScores: number[];
  winnerTeams: number[];
  winnerIds: string[];
  scores: Score[];
}

/** Секретное серверное состояние. Никогда не отдаётся клиенту целиком. */
export interface State {
  kind: "rr-alias-state";
  schema: 1;
  sessionId: string;
  hostId: string;
  settings: Settings;
  phase: Phase;
  phaseStartedAt: number;
  deadline: number | null;
  participants: Participant[];
  teams: TeamState[];
  content: Content;
  match: Match | null;
  outcome: Outcome | null;
  cancelReason: string | null;
  seq: number;
}

/** Игровые действия: POST /rooms/:id/actions. */
export type GameAction =
  | { type: "settings"; settings: Settings }
  | { type: "assignTeam"; userId: string; team: number }
  | { type: "autoTeams" }
  | { type: "explain"; text: string }
  | { type: "guess"; text: string; cardSeq: number }
  | { type: "skip"; cardSeq: number };

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

// ---------- проекция ----------

export interface ViewParticipant {
  id: string;
  username: string;
  ready: boolean;
  online: boolean;
  left: boolean;
  isHost: boolean;
  team: number;
}

export interface ViewTeam {
  index: number;
  name: string;
  shape: TeamShape;
  color: string;
  score: number;
  turnsPlayed: number;
  memberIds: string[];
}

/** Карточка в приватном окошке объясняющего. */
export interface PrivateCard {
  seq: number;
  term: string;
  forbidden: string[];
  category: string;
}

/** Открытая карточка: угаданная — сразу всем, пропущенная и истёкшая — после хода. */
export interface RevealedCard {
  seq: number;
  term: string;
  outcome: CardOutcome;
  guessedBy: string | null;
}

export interface TurnSummary {
  number: number;
  round: number;
  team: number;
  explainerId: string | null;
  scoreDelta: number;
  endedBy: TurnEnd | null;
  cards: RevealedCard[];
}

export interface HistoryCard {
  term: string;
  definition: string;
  outcome: CardOutcome;
  guessedBy: string | null;
}

export interface TeamHistory {
  team: number;
  accepted: HistoryCard[];
  skipped: HistoryCard[];
  expired: HistoryCard[];
}

export type MyRole = "explainer" | "guesser" | "observer" | "spectator";

export interface View {
  kind: "rr-alias-view";
  sessionId: string;
  phase: Phase;
  viewerId: string;
  isParticipant: boolean;
  hostId: string;
  settings: Settings;
  phaseStartedAt: number;
  deadline: number | null;
  participants: ViewParticipant[];
  teams: ViewTeam[];
  minPlayers: number;
  maxPlayers: number;
  minCards: number;
  contentCount: number;
  startBlockers: string[];
  myTeam: number | null;
  myRole: MyRole;
  round: number | null;
  turnNumber: number | null;
  totalTurns: number;
  activeTeam: number | null;
  explainerId: string | null;
  cardSeq: number | null;
  card: PrivateCard | null;
  explanations: Explanation[];
  guesses: Guess[];
  revealed: RevealedCard[];
  lastTurn: TurnSummary | null;
  history: TeamHistory[] | null;
  outcome: { teamScores: number[]; winnerTeams: number[]; winnerIds: string[] } | null;
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

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
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
  const extra = onlyKeys(value, ["teamCount", "rounds"]);
  if (extra) return fail(extra);
  const teamCount = value.teamCount ?? DEFAULT_SETTINGS.teamCount;
  const rounds = value.rounds ?? DEFAULT_SETTINGS.rounds;
  if (!isInt(teamCount, MIN_TEAMS, MAX_TEAMS)) return fail(`Число команд: от ${MIN_TEAMS} до ${MAX_TEAMS}`);
  if (!isInt(rounds, MIN_ROUNDS, MAX_ROUNDS)) return fail(`Число кругов: от ${MIN_ROUNDS} до ${MAX_ROUNDS}`);
  return ok({ teamCount, rounds });
}

function parseCardSeq(value: unknown): Parsed<number> {
  return isInt(value, 1, 1_000_000) ? ok(value) : fail("Номер карточки: целое число");
}

function parseRawText(value: unknown, max: number): Parsed<string> {
  if (typeof value !== "string") return fail("Текст: ожидается строка");
  if (value.length > max * 2) return fail(`Текст: максимум ${max} симв.`);
  return ok(value);
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
    case "autoTeams": {
      const extra = onlyKeys(value, ["type"]);
      if (extra) return fail(extra);
      return ok({ type: value.type });
    }
    case "settings": {
      const extra = onlyKeys(value, ["type", "settings"]);
      if (extra) return fail(extra);
      const settings = parseSettings(value.settings);
      return settings.ok ? ok({ type: "settings", settings: settings.value }) : settings;
    }
    case "assignTeam": {
      const extra = onlyKeys(value, ["type", "userId", "team"]);
      if (extra) return fail(extra);
      if (typeof value.userId !== "string" || value.userId.length === 0 || value.userId.length > 64) return fail("Игрок: неверный id");
      if (!isInt(value.team, 0, MAX_TEAMS - 1)) return fail("Команда: неверный номер");
      return ok({ type: "assignTeam", userId: value.userId, team: value.team });
    }
    case "explain": {
      const extra = onlyKeys(value, ["type", "text"]);
      if (extra) return fail(extra);
      const text = parseRawText(value.text, LIMITS.explanationChars);
      return text.ok ? ok({ type: "explain", text: text.value }) : text;
    }
    case "guess": {
      const extra = onlyKeys(value, ["type", "text", "cardSeq"]);
      if (extra) return fail(extra);
      const text = parseRawText(value.text, LIMITS.guessChars);
      if (!text.ok) return text;
      const seq = parseCardSeq(value.cardSeq);
      return seq.ok ? ok({ type: "guess", text: text.value, cardSeq: seq.value }) : seq;
    }
    case "skip": {
      const extra = onlyKeys(value, ["type", "cardSeq"]);
      if (extra) return fail(extra);
      const seq = parseCardSeq(value.cardSeq);
      return seq.ok ? ok({ type: "skip", cardSeq: seq.value }) : seq;
    }
    default:
      return fail("Неизвестное действие");
  }
}

/** Строгая проверка структуры карточки. id и revision назначает сервер. */
export function parseCard(value: unknown): Parsed<Card> {
  if (!isRecord(value)) return fail("Карточка: ожидается объект");
  const extra = onlyKeys(value, ["id", "revision", "term", "acceptedAnswers", "forbiddenPhrases", "forbiddenForms", "definition", "difficulty", "category"]);
  if (extra) return fail(`Карточка: ${extra}`);
  const id = value.id === undefined ? "" : value.id;
  if (typeof id !== "string" || id.length > 64 || !/^[a-z0-9-]*$/.test(id)) return fail("Карточка: неверный id");
  const revision = value.revision === undefined ? 0 : value.revision;
  if (!isInt(revision, 0, 1_000_000)) return fail("Карточка: неверная ревизия");
  const term = parseText(value.term, "Термин", 2, LIMITS.termChars);
  if (!term.ok) return term;
  const answers = parseTextList(value.acceptedAnswers, "Допустимые ответы", LIMITS.answersPerCard, LIMITS.itemChars, 1);
  if (!answers.ok) return answers;
  const phrases = parseTextList(value.forbiddenPhrases, "Запрещённые фразы", LIMITS.phrasesPerCard, LIMITS.itemChars, 3);
  if (!phrases.ok) return phrases;
  const forms = parseTextList(value.forbiddenForms ?? [], "Формы термина", LIMITS.formsPerCard, LIMITS.itemChars, 0);
  if (!forms.ok) return forms;
  const definition = parseText(value.definition, "Определение", 10, LIMITS.definitionChars);
  if (!definition.ok) return definition;
  if (value.difficulty !== 1 && value.difficulty !== 2 && value.difficulty !== 3) return fail("Сложность: 1, 2 или 3");
  const category = parseText(value.category, "Категория", 2, LIMITS.categoryChars);
  if (!category.ok) return category;
  return ok({
    id,
    revision,
    term: term.value,
    acceptedAnswers: answers.value,
    forbiddenPhrases: phrases.value,
    forbiddenForms: forms.value,
    definition: definition.value,
    difficulty: value.difficulty,
    category: category.value,
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
