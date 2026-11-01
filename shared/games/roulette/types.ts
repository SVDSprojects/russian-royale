import { z } from "zod";
export const Id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}_-]+$/u);
const Text = z.string().min(1).max(3000);
const Num = z.number().int().safe();
export const NormalizationSchema = z.strictObject({
  trim: z.boolean(),
  caseFold: z.boolean(),
  collapseSpaces: z.boolean(),
  foldYo: z.boolean(),
  stripPunctuation: z.boolean(),
});
export type Normalization = z.infer<typeof NormalizationSchema>;
export const QuestionSchema = z.strictObject({
  id: Id,
  ruleId: Id,
  ruleIds: z.array(Id).max(20),
  ruleUrl: z
    .string()
    .max(1000)
    .refine((x) => /^https:\/\//.test(x) || /^#rules\/[\w-]+$/.test(x)),
  prompt: Text,
  options: z.array(Text).max(8),
  acceptedAnswers: z.array(Text).min(1).max(20),
  explanation: Text,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  revision: Num.min(1),
  status: z.enum(["draft", "published"]),
  categoryId: Id,
  cost: z.union([
    z.literal(100),
    z.literal(200),
    z.literal(300),
    z.literal(400),
    z.literal(500),
  ]),
  normalization: NormalizationSchema,
});
export type Question = z.infer<typeof QuestionSchema>;
export const CategorySchema = z.strictObject({
  id: Id,
  label: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const ContentSchema = z
  .strictObject({
    id: Id,
    title: z.string().min(1).max(120),
    revision: Num.min(1),
    status: z.enum(["draft", "published"]),
    categories: z.array(CategorySchema).min(1).max(12),
    questions: z.array(QuestionSchema).max(1000),
  })
  .superRefine((c, ctx) => {
    const ids = c.questions.map((q) => q.id),
      cats = c.categories.map((x) => x.id);
    if (new Set(ids).size !== ids.length || new Set(cats).size !== cats.length)
      ctx.addIssue({
        code: "custom",
        message: "Идентификаторы должны быть уникальны",
      });
    for (const q of c.questions)
      if (!cats.includes(q.categoryId))
        ctx.addIssue({ code: "custom", message: "Неизвестная категория" });
  });
export type Content = z.infer<typeof ContentSchema>;
export const SettingsSchema = z.strictObject({
  contentId: Id,
  mode: z.enum(["elimination", "points", "speed"]),
  durations: z.tuple([
    Num.min(5000).max(120000),
    Num.min(5000).max(120000),
    Num.min(5000).max(120000),
  ]),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const ResultSchema = z.strictObject({
  sessionId: Id,
  winnerUserIds: z.array(Id).max(16),
  scores: z.array(z.strictObject({ userId: Id, score: Num })).max(16),
  outcome: z.enum(["win", "draw", "cancelled"]),
});
export type Result = z.infer<typeof ResultSchema>;
export const PlayerSchema = z.strictObject({
  id: Id,
  username: z.string().min(1).max(80),
  ready: z.boolean(),
  online: z.boolean(),
  offlineSince: Num.nonnegative().nullable(),
  score: Num,
  correct: Num.nonnegative(),
  lives: Num.min(0).max(2),
  teamId: Id.nullable(),
});
export const TeamSchema = z.strictObject({
  id: Id,
  name: z.string().min(1).max(80),
  captainId: Id,
  score: Num,
});
export const ChatSchema = z.strictObject({
  id: Id,
  userId: Id,
  teamId: Id,
  text: z.string().min(1).max(500),
  at: Num.nonnegative(),
});
export const StateSchema = z.strictObject({
  sessionId: Id,
  hostId: Id,
  phase: z.enum([
    "lobby",
    "spin",
    "question",
    "reveal",
    "roundResult",
    "finished",
  ]),
  phaseStartedAt: Num.nonnegative(),
  deadline: Num.nonnegative().nullable(),
  settings: SettingsSchema,
  contentSnapshot: ContentSchema,
  players: z.array(PlayerSchema).max(16),
  teams: z.array(TeamSchema).max(4),
  round: Num.min(0).max(25),
  currentId: Id.nullable(),
  used: z.array(Id).max(1000),
  answers: z
    .array(
      z.strictObject({ userId: Id, text: Text, receivedAt: Num.nonnegative() }),
    )
    .max(16),
  roundPlayers: z.array(Id).max(16),
  sectorIndex: Num.min(0),
  sectorIds: z.array(Id).max(12),
  chooserTeamId: Id.nullable(),
  answererId: Id.nullable(),
  blockedTeams: z.array(Id).max(4),
  chat: z.array(ChatSchema).max(100),
  flags: z.array(z.strictObject({ questionId: Id, teamId: Id })).max(25),
  finishedResult: ResultSchema.nullable(),
});
export type State = z.infer<typeof StateSchema>;
export const ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready"), ready: z.boolean() }),
  z.strictObject({ type: z.literal("start") }),
  z.strictObject({ type: z.literal("cancel") }),
  z.strictObject({ type: z.literal("rematch") }),
  z.strictObject({ type: z.literal("answer"), text: Text }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const PublicQuestionSchema = QuestionSchema.omit({
  acceptedAnswers: true,
  explanation: true,
  normalization: true,
  status: true,
  revision: true,
  ruleId: true,
  ruleIds: true,
  ruleUrl: true,
});
export const ViewSchema = z.strictObject({
  sessionId: Id,
  hostId: Id,
  phase: StateSchema.shape.phase,
  phaseStartedAt: Num.nonnegative(),
  deadline: Num.nonnegative().nullable(),
  settings: SettingsSchema,
  players: z.array(PlayerSchema).max(16),
  teams: z.array(TeamSchema).max(4),
  round: Num.min(0).max(25),
  categories: z.array(CategorySchema).max(12),
  board: z
    .array(
      z.strictObject({
        id: Id,
        categoryId: Id,
        cost: Num,
        closed: z.boolean(),
      }),
    )
    .max(1000),
  question: PublicQuestionSchema.nullable(),
  reveal: z
    .strictObject({
      acceptedAnswers: z.array(Text),
      explanation: Text,
      ruleId: Id,
      ruleUrl: z.string(),
      answers: z.array(
        z.strictObject({ userId: Id, text: Text, correct: z.boolean() }),
      ),
    })
    .nullable(),
  answeredUserIds: z.array(Id).max(16),
  sectorIndex: Num.min(0),
  sectorIds: z.array(Id).max(12),
  chooserTeamId: Id.nullable(),
  answererId: Id.nullable(),
  blockedTeams: z.array(Id).max(4),
  chat: z.array(ChatSchema).max(100),
  flags: z.array(z.strictObject({ questionId: Id, teamId: Id })).max(25),
  result: ResultSchema.nullable(),
  contentIssues: z.array(z.string()).max(30),
});
export type View = z.infer<typeof ViewSchema>;
export type Context = {
  nowMs: number;
  randomInt: (maxExclusive: number) => number;
};
export type CreateInput = {
  sessionId: string;
  hostId: string;
  participants: { id: string; username: string }[];
  settings: Settings;
  contentSnapshot: Content;
  ctx: Context;
};
export type GameProps = {
  view: View;
  currentUserId: string;
  send: (action: Action) => Promise<void>;
  connection: "online" | "reconnecting" | "offline";
  serverNowMs: number;
  onExit: () => void;
};
export const EnvelopeSchema = z.strictObject({
  view: ViewSchema,
  version: Num.nonnegative(),
  serverNow: Num.nonnegative(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;
export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}
export class EmptyRosterError extends GameError {
  constructor() {
    super(422, "В партии нет участников");
  }
}
export class CancelledMatchError extends GameError {
  constructor() {
    super(422, "Партия отменена");
  }
}
export function normalize(text: string, n: Normalization): string {
  let s = text;
  if (n.trim) s = s.trim();
  if (n.collapseSpaces) s = s.replace(/\s+/gu, " ");
  if (n.caseFold) s = s.toLocaleLowerCase("ru-RU");
  if (n.foldYo) s = s.replace(/ё/g, "е").replace(/Ё/g, "Е");
  if (n.stripPunctuation) s = s.replace(/\p{P}/gu, "");
  return s;
}
export function isCorrect(q: Question, text: string): boolean {
  return q.acceptedAnswers.some(
    (a) => normalize(a, q.normalization) === normalize(text, q.normalization),
  );
}
export function contentIssues(c: Content): string[] {
  const issues: string[] = [];
  const qs = c.questions.filter((q) => q.status === "published");
  if (c.status !== "published") issues.push("Набор не опубликован");
  for (const level of [1, 2, 3])
    if (qs.filter((q) => q.difficulty === level).length < 3)
      issues.push(`Уровень ${level}: нужно минимум 3 опубликованных задания`);
  return issues.slice(0, 30);
}
export const defaultSettings: Settings = {
  contentId: "demo",
  mode: "points",
  durations: [30000, 25000, 20000],
};
