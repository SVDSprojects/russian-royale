import { z } from "zod";
export const SettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(6),
    educational: z.boolean(),
    ruleIds: z.array(z.string().min(1).max(100)).max(100),
  })
  .strict();
export type Settings = z.infer<typeof SettingsSchema>;
export const ContentSchema = z
  .object({
    id: z.string().min(1).max(100),
    ruleId: z.string().min(1).max(100),
    prompt: z.string().min(1).max(2000),
    options: z.array(z.string().min(1).max(500)).min(2).max(8),
    acceptedAnswers: z.array(z.number().int().nonnegative()).min(1).max(8),
    explanation: z.string().min(1).max(3000),
    difficulty: z.number().int().min(1).max(5),
    revision: z.number().int().positive(),
    status: z.enum(["draft", "published"]),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      c.acceptedAnswers.some((i) => i >= c.options.length) ||
      new Set(c.acceptedAnswers).size !== c.acceptedAnswers.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Недопустимые правильные варианты",
      });
  });
export type Content = z.infer<typeof ContentSchema>;
export const CardSchema = z
  .object({
    suit: z.enum(["clubs", "diamonds", "hearts", "spades"]),
    rank: z.number().int().min(6).max(14),
  })
  .strict();
export type Card = z.infer<typeof CardSchema>;
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("attack"), card: CardSchema }).strict(),
  z
    .object({
      type: z.literal("defend"),
      card: CardSchema,
      pair: z.number().int().min(0).max(5),
    })
    .strict(),
  z.object({ type: z.literal("pass") }).strict(),
  z.object({ type: z.literal("take") }).strict(),
  z.object({ type: z.literal("bonus") }).strict(),
  z
    .object({
      type: z.literal("answer"),
      answers: z.array(z.number().int().min(0).max(7)).max(8),
    })
    .strict(),
]);
export type Action = z.infer<typeof ActionSchema>;
export const ParticipantSchema = z
  .object({
    id: z.string().min(1).max(100),
    username: z.string().min(1).max(80),
  })
  .strict();
export const PlayerSchema = ParticipantSchema.extend({
  hand: z.array(CardSchema).max(36),
  out: z.boolean(),
  bonusUsed: z.boolean(),
  stats: z
    .object({
      asked: z.number().int().nonnegative(),
      correct: z.number().int().nonnegative(),
      wrong: z.number().int().nonnegative(),
      timedOut: z.number().int().nonnegative(),
    })
    .strict(),
}).strict();
const PairSchema = z
  .object({ attack: CardSchema, defense: CardSchema.nullable() })
  .strict();
export const ResultSchema = z
  .object({
    sessionId: z.string().min(1),
    winnerUserIds: z.array(z.string()),
    scores: z.array(
      z
        .object({
          userId: z.string(),
          score: z.union([z.literal(30), z.literal(50), z.literal(100)]),
        })
        .strict(),
    ),
    outcome: z.enum(["win", "draw", "cancelled"]),
  })
  .strict();
export type Result = z.infer<typeof ResultSchema>;
export const StateSchema = z
  .object({
    sessionId: z.string().min(1),
    hostId: z.string().min(1),
    settings: SettingsSchema,
    contentSnapshot: z.array(ContentSchema),
    players: z.array(PlayerSchema).min(2).max(6),
    phase: z.enum([
      "lobby",
      "dealing",
      "attack",
      "defend",
      "refill",
      "finished",
    ]),
    deck: z.array(CardSchema).max(36),
    discard: z.array(CardSchema).max(36),
    trump: CardSchema,
    table: z.array(PairSchema).max(6),
    attacker: z.number().int().min(0).max(5),
    defender: z.number().int().min(0).max(5),
    turn: z.number().int().min(0).max(5),
    round: z.number().int().min(0).max(150),
    limit: z.number().int().min(0).max(6),
    lastThrower: z.number().int().min(0).max(5),
    passes: z.number().int().nonnegative(),
    taking: z.boolean(),
    throwRemaining: z.number().int().min(0).max(5),
    deadline: z.number().finite().nullable(),
    bonus: z
      .object({
        userId: z.string(),
        contentId: z.string(),
        deadline: z.number().finite(),
        remainingMs: z.number().min(0).max(25000),
      })
      .strict()
      .nullable(),
    feedback: z
      .object({
        userId: z.string(),
        correct: z.boolean(),
        explanation: z.string(),
      })
      .strict()
      .nullable(),
    final: ResultSchema.nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      new Set(s.players.map((p) => p.id)).size !== s.players.length ||
      !s.players.some((p) => p.id === s.hostId)
    )
      bad("Некорректные участники");
    if (
      s.players.length > s.settings.maxPlayers ||
      [s.attacker, s.defender, s.turn, s.lastThrower].some(
        (i) => i >= s.players.length,
      )
    )
      bad("Некорректные места игроков");
    const cards = [
      ...s.deck,
      ...s.discard,
      ...s.players.flatMap((p) => p.hand),
      ...s.table.flatMap((p) =>
        p.defense ? [p.attack, p.defense] : [p.attack],
      ),
    ];
    if (
      cards.length !== 36 ||
      new Set(cards.map((c) => `${c.suit}:${c.rank}`)).size !== 36
    )
      bad("Нарушен состав колоды");
    if (s.table.length > s.limit) bad("Превышен лимит захода");
    if (
      (s.phase === "finished") !== !!s.final ||
      (s.final && s.final.sessionId !== s.sessionId)
    )
      bad("Несогласованный результат");
    if (s.phase === "finished" && s.deadline !== null)
      bad("Завершённый таймер");
    if (
      s.bonus &&
      (!s.players.some((p) => p.id === s.bonus!.userId) ||
        !s.contentSnapshot.some((c) => c.id === s.bonus!.contentId))
    )
      bad("Некорректный бонус");
  });
export type State = z.infer<typeof StateSchema>;
export const PublicTaskSchema = z
  .object({
    id: z.string(),
    prompt: z.string(),
    options: z.array(z.string()),
    deadline: z.number(),
  })
  .strict();
export const ViewSchema = z
  .object({
    sessionId: z.string(),
    hostId: z.string(),
    settings: SettingsSchema,
    phase: StateSchema.shape.phase,
    players: z.array(
      z
        .object({
          id: z.string(),
          username: z.string(),
          count: z.number().int().nonnegative(),
          out: z.boolean(),
          bonusUsed: z.boolean(),
          stats: PlayerSchema.shape.stats,
        })
        .strict(),
    ),
    hand: z.array(CardSchema),
    deckCount: z.number().int().nonnegative(),
    trump: CardSchema,
    discardCount: z.number().int().nonnegative(),
    table: z.array(PairSchema),
    attackerId: z.string(),
    defenderId: z.string(),
    turnId: z.string(),
    round: z.number().int(),
    limit: z.number().int(),
    taking: z.boolean(),
    deadline: z.number().nullable(),
    task: PublicTaskSchema.nullable(),
    feedback: StateSchema.shape.feedback,
    final: ResultSchema.nullable(),
    legalCards: z.array(CardSchema),
    canBonus: z.boolean(),
    canPass: z.boolean(),
    canTake: z.boolean(),
  })
  .strict();
export type View = z.infer<typeof ViewSchema>;
export interface Context {
  nowMs: number;
  randomInt: (maxExclusive: number) => number;
}
export interface CreateInput {
  sessionId: string;
  hostId: string;
  participants: { id: string; username: string }[];
  settings: Settings;
  contentSnapshot: Content[];
  ctx: Context;
}
export interface DB {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  exec(sql: string): void;
  close(): void;
  transactionSync?<T>(callback: () => T): T;
}
export const CommandSchema = z
  .object({
    commandId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class MatchCancelledError extends GameError {
  constructor() {
    super(422, "Партия отменена");
  }
}
export class EmptyParticipantsError extends GameError {
  constructor() {
    super(422, "Нет участников");
  }
}
