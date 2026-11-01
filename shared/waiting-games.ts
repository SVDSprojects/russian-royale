export type WaitingGame = {
  id: string;
  game: 'spy' | 'jeopardy' | 'roulette';
  name: string;
  serverId: string;
  serverName: string;
  waiting: number;
  joined: boolean;
};
