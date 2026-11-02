export type WaitingGame = {
  id: string;
  game: 'spy' | 'jeopardy' | 'roulette' | 'alias' | 'whoami' | 'impostor' | 'mafia' | 'bunker' | 'broken-text' | 'durak';
  name: string;
  serverId: string;
  serverName: string;
  waiting: number;
  joined: boolean;
};
