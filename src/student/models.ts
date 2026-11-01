export type User = {
  id: string;
  username: string;
  email?: string;
  role: string;
  xp: number;
  avatar?: string;
  createdAt?: string;
};
export type Exercise = {
  id: string;
  ruleId: string;
  type: string;
  prompt: string;
  options: string[];
  difficulty: number;
  explanation?: string;
};
export type Rule = {
  id: string;
  title: string;
  category: string;
  categoryId: string;
  subcategory: string;
  summary: string;
  explanation: string;
  examples: string[];
  mistakes: string[];
  images: string[];
  difficulty: number;
  games: string[];
  exercises?: Exercise[];
};
export type Emotion = 'neutral' | 'happy' | 'strict' | 'surprised' | 'explaining';
export type Block = {
  id: string;
  type: string;
  text?: string;
  image?: string;
  emotion?: Emotion;
  exerciseId?: string;
};
export type Lesson = { id: string; ruleId: string; title: string; blocks: Block[]; published: boolean };
export type Teacher = {
  name: string;
  images: Record<Emotion, string>;
  phrases: { intro: string; correct: string; incorrect: string; complete: string };
};
export type Progress = {
  favorites: string[];
  learned: string[];
  completedLessons: string[];
  answers: Record<string, unknown>[];
};
export type Player = {
  id: string;
  username: string;
  avatar?: string;
  ready: boolean;
  online: boolean;
  voted: boolean;
};
export type Room = {
  id: string;
  serverId: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  playerCount: number;
  phase: 'lobby' | 'discussion' | 'voting' | 'guess' | 'finished';
  discussionSeconds: number;
  voteSeconds: number;
  guessSeconds: number;
};
export type RoomView = Room & {
  players: Player[];
  me: { role?: 'spy' | 'citizen'; category?: string; topic?: string; voted: boolean; ready: boolean };
  deadline: number | null;
  serverNow: number;
  round: number;
  sessionId: string | null;
  result: null | {
    winner: 'spy' | 'citizens';
    reason: string;
    topic: string;
    spyId: string;
    votes: Record<string, string>;
  };
};
export type Server = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  memberCount: number;
  roomCount: number;
  createdAt: string;
  members?: Player[];
  rooms?: Room[];
  invites?: { token: string; url: string; createdAt: string }[];
};
export type Message = { id: string; userId: string; username: string; text: string; createdAt: string };
export type Profile = {
  user: User;
  stats: { games: number; wins: number; losses: number; lessons: number };
  history: Record<string, unknown>[];
  achievements: unknown[];
};
export const gameModes = [
  { name: 'Шпион', label: 'Социальная дедукция', players: '3–30 игроков', icon: 'spy', available: true },
  { name: 'Мафия', label: 'Ночь скрывает многое', players: 'Командная стратегия', icon: 'moon', available: true, route: 'games/mafia' },
  { name: 'Бункер', label: 'Убеди, чтобы выжить', players: 'Дискуссия и выбор', icon: 'shield', available: true, route: 'games/bunker' },
  { name: 'Дурак', label: 'Твой козырь — знания', players: '2–6 игроков', icon: 'cards', available: true, route: 'games/durak' },
  { name: 'Самозванец', label: 'Найди чужую тему', players: 'Социальная дедукция', icon: 'eye', available: true, route: 'games/impostor' },
  { name: 'Кто я?', label: 'Вопрос за вопросом', players: 'Угадывание терминов', icon: 'help', available: true, route: 'games/whoami' },
  { name: 'Alias', label: 'Объясни своими словами', players: 'Командная игра', icon: 'chat', available: true, route: 'games/alias' },
  { name: 'Русская рулетка', label: 'Проверь свою удачу', players: 'Задания на выбывание', icon: 'target', available: true, route: 'games/roulette' },
  { name: 'Своя игра', label: 'Выбирай свою категорию', players: 'Интеллектуальный турнир', icon: 'grid', available: true, route: 'games/jeopardy' },
  { name: 'Испорченный текст', label: 'Найди все ошибки', players: 'Редакторская гонка', icon: 'type', available: true, route: 'games/broken-text' },
];
