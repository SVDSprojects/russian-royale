import type { Express } from 'express';
import type { RegisterContext } from './games/jeopardy/routes';
import type { WaitingGame } from '../shared/waiting-games';

export function registerWaitingGames(app: Express, { db, requireAuth, now }: RegisterContext) {
  app.get('/api/waiting-games', requireAuth, (req, res) => {
    const userId = req.user!.id,
      time = now();
    const waiting: (WaitingGame & { activity: number })[] = [];
    const spies = db
      .prepare(
        `SELECT r.*, s.name AS server_name,
      (SELECT COUNT(*) FROM room_members p WHERE p.room_id=r.id AND p.left_at IS NULL) AS occupied,
      (SELECT COUNT(*) FROM room_members p WHERE p.room_id=r.id AND p.left_at IS NULL AND p.last_seen>?) AS online,
      (SELECT MAX(p.last_seen) FROM room_members p WHERE p.room_id=r.id AND p.left_at IS NULL AND p.user_id<>?) AS activity,
      EXISTS(SELECT 1 FROM room_members p WHERE p.room_id=r.id AND p.user_id=? AND p.left_at IS NULL) AS joined
      FROM rooms r JOIN servers s ON s.id=r.server_id
      JOIN server_members m ON m.server_id=s.id AND m.user_id=? WHERE r.phase='lobby'`,
      )
      .all(time - 45000, userId, userId, userId);
    for (const r of spies)
      if (r.activity > time - 45000 && r.occupied < r.max_players)
        waiting.push({
          id: r.id,
          game: 'spy',
          name: r.name,
          serverId: r.server_id,
          serverName: r.server_name,
          waiting: r.online,
          joined: !!r.joined,
          activity: r.activity,
        });
    for (const game of ['jeopardy', 'roulette'] as const) {
      // Table names are fixed constants. Only members of the private server see its rooms.
      const rows = db
        .prepare(
          `SELECT r.*, s.name AS server_name,
        (SELECT COUNT(*) FROM rr_${game}_participants p WHERE p.room_id=r.id AND p.last_seen>?) AS online,
        (SELECT MAX(p.last_seen) FROM rr_${game}_participants p WHERE p.room_id=r.id AND p.user_id<>?) AS activity
        FROM rr_${game}_rooms r JOIN servers s ON s.id=r.server_id
        JOIN server_members m ON m.server_id=s.id AND m.user_id=? WHERE r.active=1`,
        )
        .all(time - 15000, userId, userId);
      for (const r of rows) {
        const state = JSON.parse(r.state);
        if (
          state.phase !== 'lobby' ||
          state.players.length >= 16 ||
          r.activity <= time - 15000 ||
          r.activity == null
        )
          continue;
        waiting.push({
          id: r.id,
          game,
          name: r.name,
          serverId: r.server_id,
          serverName: r.server_name,
          waiting: r.online,
          joined: state.players.some((p: { id: string }) => p.id === userId),
          activity: r.activity,
        });
      }
    }
    res.json({
      rooms: waiting
        .sort((a, b) => b.activity - a.activity)
        .slice(0, 30)
        .map(({ activity, ...room }) => room),
    });
  });
}
