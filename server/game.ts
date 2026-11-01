import type { Express, Request, RequestHandler } from 'express';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { type DB, transaction } from './storage';
import { HttpError, str, integer, body, iso } from './core';

type Context = {
  db: DB;
  requireAuth: RequestHandler;
  requireRole: (...roles: any[]) => RequestHandler;
  broadcast: () => void;
  now: () => number;
  onlineUsers?: Map<string, number>;
};
export function normalizeGuess(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
export function matchesSpyTopic(answer: string, title: string) {
  if (normalizeGuess(answer) === normalizeGuess(title)) return true;
  const tokens = (v: string) =>
    v
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[а-яa-z0-9]+/g) || [];
  const roots = (v: string) =>
    tokens(v).filter((t) =>
      /^(раст|ращ|рос|рост|лаг|лож|кас|кос|бер|бир|дер|дир|мер|мир|тер|тир|гар|гор|зар|зор|клан|клон|твар|твор|плав|плов|скак|скоч)$/.test(
        t,
      ),
    );
  const expected = [...new Set(roots(title))],
    actual = new Set(roots(answer));
  if (/(^|\s)(не|нет)(\s|$)/i.test(answer)) return false;
  const groups = [
    ['раст', 'ращ', 'рос', 'рост'],
    ['лаг', 'лож'],
    ['кас', 'кос'],
    ['бер', 'бир'],
    ['дер', 'дир'],
    ['мер', 'мир'],
    ['тер', 'тир'],
    ['гар', 'гор'],
    ['зар', 'зор'],
  ];
  const group = groups.find((g) => expected.length >= 2 && expected.every((x) => g.includes(x)));
  return !!group && actual.size >= 2 && [...actual].every((x) => group.includes(x));
}
export function majorityTarget(votes: { target_id: string }[], size: number): string | null {
  const counts = new Map<string, number>();
  for (const vote of votes) counts.set(vote.target_id, (counts.get(vote.target_id) || 0) + 1);
  return [...counts].find(([, count]) => count > size / 2)?.[0] ?? null;
}
export function registerGameRoutes(app: Express, ctx: Context) {
  const { db, requireAuth, now, broadcast } = ctx;

  const get = (sql: string, ...args: any[]) => db.prepare(sql).get(...args);
  const all = (sql: string, ...args: any[]) => db.prepare(sql).all(...args);
  const run = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);
  const stamp = () => iso(now());
  const member = (serverId: string, userId: string) => {
    const server = get('SELECT * FROM servers WHERE id=?', serverId);
    if (!server || !get('SELECT 1 FROM server_members WHERE server_id=? AND user_id=?', serverId, userId))
      throw new HttpError(404, 'Сервер не найден или доступ закрыт.');
    return server;
  };
  const roomFor = (roomId: string, userId: string) => {
    const room = get('SELECT * FROM rooms WHERE id=?', roomId);
    if (!room) throw new HttpError(404, 'Комната не найдена.');
    member(room.server_id, userId);
    return room;
  };
  const participant = (room: any, userId: string) => {
    if (!get('SELECT 1 FROM room_members WHERE room_id=? AND user_id=? AND left_at IS NULL', room.id, userId))
      throw new HttpError(403, 'Сначала присоединитесь к комнате.');
    if (
      room.session_id &&
      !get('SELECT 1 FROM game_players WHERE session_id=? AND user_id=?', room.session_id, userId)
    )
      throw new HttpError(403, 'Вы не участвуете в этом раунде.');
  };
  const touch = (roomId: string, userId: string) =>
    run(
      'UPDATE room_members SET last_seen=? WHERE room_id=? AND user_id=? AND left_at IS NULL',
      now(),
      roomId,
      userId,
    );
  const isOnline = (p: any) => p.left_at == null && now() - p.last_seen < 45000;
  const audit = (actor: string, action: string, target: string) =>
    run(
      'INSERT INTO audit_log(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)',
      randomUUID(),
      actor,
      action,
      target,
      stamp(),
    );
  const roomBase = (r: any) => ({
    id: r.id,
    serverId: r.server_id,
    name: r.name,
    hostId: r.host_id,
    maxPlayers: r.max_players,
    phase: r.phase,
    playerCount: get('SELECT count(*) AS n FROM room_members WHERE room_id=? AND left_at IS NULL', r.id).n,
    discussionSeconds: r.discussion_seconds,
    voteSeconds: r.vote_seconds,
    guessSeconds: r.guess_seconds,
  });
  const inviteURL = (req: Request, token: string) =>
    process.env.PUBLIC_ORIGIN
      ? `${process.env.PUBLIC_ORIGIN.replace(/\/$/, '')}/invite/${token}`
      : `/invite/${token}`;
  const serverBase = (s: any) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    ownerId: s.owner_id,
    createdAt: s.created_at,
    memberCount: get('SELECT count(*) AS n FROM server_members WHERE server_id=?', s.id).n,
    roomCount: get('SELECT count(*) AS n FROM rooms WHERE server_id=?', s.id).n,
  });
  function finish(r: any, winner: 'spy' | 'citizens', reason: string) {
    const session = get('SELECT * FROM game_sessions WHERE id=?', r.session_id);
    if (!session || session.finished_at) return;
    transaction(db, () => {
      run(
        'UPDATE game_sessions SET finished_at=?,winner=?,reason=? WHERE id=? AND finished_at IS NULL',
        stamp(),
        winner,
        reason,
        session.id,
      );
      run("UPDATE rooms SET phase='finished',deadline=NULL WHERE id=?", r.id);
      for (const player of all('SELECT * FROM game_players WHERE session_id=?', session.id)) {
        const win = (winner === 'spy') === (player.role === 'spy'),
          xp = win ? 30 : 10;
        const inserted = run(
          'INSERT OR IGNORE INTO game_results(session_id,user_id,win,xp,topic_title,created_at) VALUES(?,?,?,?,?,?)',
          session.id,
          player.user_id,
          Number(win),
          xp,
          session.topic_title,
          stamp(),
        );
        if (inserted.changes) run('UPDATE users SET xp=xp+? WHERE id=?', xp, player.user_id);
      }
    });
    broadcast();
  }
  function resolveVoting(r: any, phaseStart = now()) {
    const votes = all('SELECT target_id FROM game_votes WHERE session_id=?', r.session_id);
    const size = get('SELECT count(*) AS n FROM game_players WHERE session_id=?', r.session_id).n;
    const target = majorityTarget(votes, size);
    const session = get('SELECT * FROM game_sessions WHERE id=?', r.session_id);
    if (!target) {
      finish(r, 'spy', 'Большинство не определилось: ничья или недостаточно голосов. Шпион ускользнул.');
      return;
    }
    if (target !== session.spy_id) {
      finish(r, 'spy', 'Большинство выбрало мирного игрока. Шпион остался незамеченным.');
      return;
    }
    run("UPDATE rooms SET phase='guess',deadline=? WHERE id=?", phaseStart + r.guess_seconds * 1000, r.id);
    broadcast();
  }
  function advanceExpired(r: any) {
    // Use persisted deadlines, so a server restart cannot give an expired round extra time.
    for (let i = 0; i < 4 && r.deadline && r.deadline <= now(); i++) {
      if (r.phase === 'discussion') {
        run(
          "UPDATE rooms SET phase='voting',deadline=? WHERE id=?",
          r.deadline + r.vote_seconds * 1000,
          r.id,
        );
        broadcast();
      } else if (r.phase === 'voting') resolveVoting(r, r.deadline);
      else if (r.phase === 'guess')
        finish(r, 'citizens', 'Шпион не назвал тему за отведённое время. Победа мирных игроков.');
      else break;
      r = get('SELECT * FROM rooms WHERE id=?', r.id);
    }
  }
  function transferHost(r: any) {
    const players = all('SELECT * FROM room_members WHERE room_id=? ORDER BY joined_at,user_id', r.id);
    const host = players.find((p) => p.user_id === r.host_id);
    if (host && isOnline(host)) return;
    const next = players.find((p) => p.user_id !== r.host_id && isOnline(p));
    if (next) {
      run('UPDATE rooms SET host_id=? WHERE id=?', next.user_id, r.id);
      broadcast();
    }
  }
  function tick() {
    for (const r of all('SELECT * FROM rooms')) {
      advanceExpired(r);
      transferHost(r);
    }
  }
  function roomView(roomId: string, userId: string) {
    let r = roomFor(roomId, userId);
    touch(roomId, userId);
    advanceExpired(r);
    transferHost(r);
    r = get('SELECT * FROM rooms WHERE id=?', roomId);
    const session = r.session_id ? get('SELECT * FROM game_sessions WHERE id=?', r.session_id) : null;
    const myRole = session
      ? get('SELECT role FROM game_players WHERE session_id=? AND user_id=?', session.id, userId)
      : null;
    const votes = session
      ? all('SELECT voter_id,target_id FROM game_votes WHERE session_id=?', session.id)
      : [];
    const voted = new Set(votes.map((v) => v.voter_id));
    const members = all(
      'SELECT rm.*,u.username,u.avatar FROM room_members rm JOIN users u ON u.id=rm.user_id WHERE room_id=? ORDER BY joined_at,user_id',
      roomId,
    ).filter((p) =>
      r.phase === 'lobby'
        ? p.left_at == null
        : !!get('SELECT 1 FROM game_players WHERE session_id=? AND user_id=?', r.session_id, p.user_id),
    );
    const me: any = { ready: !!members.find((p) => p.user_id === userId)?.ready, voted: voted.has(userId) };
    if (myRole) {
      me.role = myRole.role;
      me.category = session.topic_category;
      if (myRole.role === 'citizen') me.topic = session.topic_title;
    }
    return {
      ...roomBase(r),
      players: members.map((p) => ({
        id: p.user_id,
        username: p.username,
        avatar: p.avatar,
        ready: !!p.ready,
        online: isOnline(p),
        voted: voted.has(p.user_id),
      })),
      me,
      deadline: r.deadline,
      serverNow: now(),
      round: r.round,
      sessionId: r.session_id,
      result: session?.finished_at
        ? {
            winner: session.winner,
            reason: session.reason,
            topic: session.topic_title,
            spyId: session.spy_id,
            votes: Object.fromEntries(votes.map((v) => [v.voter_id, v.target_id])),
          }
        : null,
    };
  }
  const route = (method: 'get' | 'post' | 'delete', path: string, handler: (req: Request) => any) =>
    app[method](`/api${path}`, requireAuth, (req, res) => {
      const result = handler(req);
      res.json(result ?? {});
    });
  route('get', '/servers', (req) =>
    all(
      'SELECT s.* FROM servers s JOIN server_members m ON m.server_id=s.id WHERE m.user_id=? ORDER BY s.created_at DESC',
      req.user!.id,
    ).map(serverBase),
  );
  route('post', '/servers', (req) => {
    const b = body(req),
      name = str(b.name, 'Название', 2, 80),
      description = str(b.description ?? '', 'Описание', 0, 500),
      sid = randomUUID();
    if (get('SELECT count(*) AS n FROM servers WHERE owner_id=?', req.user!.id).n >= 20)
      throw new HttpError(400, 'Лимит: 20 собственных серверов.');
    transaction(db, () => {
      run(
        'INSERT INTO servers(id,name,description,owner_id,created_at) VALUES(?,?,?,?,?)',
        sid,
        name,
        description,
        req.user!.id,
        stamp(),
      );
      run('INSERT INTO server_members VALUES(?,?,?)', sid, req.user!.id, stamp());
    });
    broadcast();
    return serverBase(get('SELECT * FROM servers WHERE id=?', sid));
  });
  route('get', '/servers/:id', (req) => {
    const s = member(String(req.params.id), req.user!.id);
    return {
      ...serverBase(s),
      members: all(
        'SELECT u.id,u.username,u.avatar FROM server_members m JOIN users u ON u.id=m.user_id WHERE m.server_id=?',
        s.id,
      ).map((p) => ({
        ...p,
        online:
          (ctx.onlineUsers?.get(p.id) || 0) > now() - 45000 ||
          !!get(
            'SELECT 1 FROM room_members WHERE user_id=? AND last_seen>? AND left_at IS NULL',
            p.id,
            now() - 45000,
          ),
      })),
      rooms: all('SELECT * FROM rooms WHERE server_id=? ORDER BY created_at DESC', s.id).map(roomBase),
      ...(s.owner_id === req.user!.id
        ? {
            invites: all('SELECT * FROM invites WHERE server_id=? AND revoked=0', s.id).map((i) => ({
              token: i.token,
              url: inviteURL(req, i.token),
              createdAt: i.created_at,
            })),
          }
        : {}),
    };
  });
  route('post', '/servers/:id/invites', (req) => {
    const s = member(String(req.params.id), req.user!.id);
    if (s.owner_id !== req.user!.id) throw new HttpError(403, 'Ссылки создаёт владелец сервера.');
    if (get('SELECT count(*) AS n FROM invites WHERE server_id=? AND revoked=0', s.id).n >= 20)
      throw new HttpError(400, 'Отзовите старую ссылку, чтобы создать новую.');
    const token = randomBytes(24).toString('base64url');
    run(
      'INSERT INTO invites(token,server_id,created_by,created_at) VALUES(?,?,?,?)',
      token,
      s.id,
      req.user!.id,
      stamp(),
    );
    broadcast();
    return { token, url: inviteURL(req, token) };
  });
  app.get('/api/invites/:token', (req, res) => {
    const i = get(
      'SELECT s.* FROM invites i JOIN servers s ON s.id=i.server_id WHERE i.token=? AND i.revoked=0',
      String(req.params.token),
    );
    if (!i) throw new HttpError(404, 'Приглашение отозвано или не существует.');
    res.json({ server: { id: i.id, name: i.name, description: i.description }, valid: true });
  });
  route('delete', '/invites/:token', (req) => {
    const i = get(
      'SELECT i.*,s.owner_id FROM invites i JOIN servers s ON s.id=i.server_id WHERE i.token=?',
      String(req.params.token),
    );
    if (!i || i.owner_id !== req.user!.id) throw new HttpError(403, 'Отозвать ссылку может её владелец.');
    run('UPDATE invites SET revoked=1 WHERE token=?', i.token);
    broadcast();
    return {};
  });
  route('post', '/invites/:token/join', (req) => {
    const i = get('SELECT * FROM invites WHERE token=? AND revoked=0', String(req.params.token));
    if (!i) throw new HttpError(404, 'Приглашение отозвано или не существует.');
    run('INSERT OR IGNORE INTO server_members VALUES(?,?,?)', i.server_id, req.user!.id, stamp());
    broadcast();
    return { serverId: i.server_id };
  });
  route('post', '/servers/:id/rooms', (req) => {
    const s = member(String(req.params.id), req.user!.id),
      b = body(req),
      rid = randomUUID();
    const name = str(b.name, 'Название комнаты', 2, 80),
      max = integer(b.maxPlayers, 'Участники', 3, 30, 30),
      discussion = integer(b.discussionSeconds, 'Обсуждение', 30, 900, 180),
      vote = integer(b.voteSeconds, 'Голосование', 15, 180, 45),
      guess = integer(b.guessSeconds, 'Ответ шпиона', 15, 120, 30);
    if (get('SELECT count(*) AS n FROM rooms WHERE server_id=?', s.id).n >= 30)
      throw new HttpError(400, 'На сервере уже 30 комнат.');
    transaction(db, () => {
      run(
        'INSERT INTO rooms(id,server_id,name,host_id,max_players,discussion_seconds,vote_seconds,guess_seconds,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        rid,
        s.id,
        name,
        req.user!.id,
        max,
        discussion,
        vote,
        guess,
        stamp(),
      );
      run(
        'INSERT INTO room_members(room_id,user_id,joined_at,last_seen) VALUES(?,?,?,?)',
        rid,
        req.user!.id,
        stamp(),
        now(),
      );
    });
    broadcast();
    return roomView(rid, req.user!.id);
  });
  route('get', '/rooms/:id', (req) => roomView(String(req.params.id), req.user!.id));
  route('post', '/rooms/:id/join', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    advanceExpired(r);
    const existing = get('SELECT * FROM room_members WHERE room_id=? AND user_id=?', r.id, req.user!.id);
    if (
      r.phase !== 'lobby' &&
      !get('SELECT 1 FROM game_players WHERE session_id=? AND user_id=?', r.session_id, req.user!.id)
    )
      throw new HttpError(409, 'Раунд уже идёт. Дождитесь следующего.');
    const count = get('SELECT count(*) AS n FROM room_members WHERE room_id=? AND left_at IS NULL', r.id).n;
    if ((!existing || existing.left_at != null) && count >= r.max_players)
      throw new HttpError(409, 'Комната заполнена.');
    run(
      'INSERT INTO room_members(room_id,user_id,joined_at,last_seen) VALUES(?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET last_seen=excluded.last_seen,left_at=NULL',
      r.id,
      req.user!.id,
      stamp(),
      now(),
    );
    broadcast();
    return roomView(r.id, req.user!.id);
  });
  route('post', '/rooms/:id/leave', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    run('UPDATE room_members SET left_at=?,ready=0 WHERE room_id=? AND user_id=?', now(), r.id, req.user!.id);
    transferHost(r);
    broadcast();
    return {};
  });
  route('post', '/rooms/:id/ready', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    if (r.phase !== 'lobby') throw new HttpError(409, 'Готовность меняется до начала игры.');
    const b = body(req);
    if (typeof b.ready !== 'boolean') throw new HttpError(400, 'Укажите готовность.');
    if (
      !get('SELECT 1 FROM room_members WHERE room_id=? AND user_id=? AND left_at IS NULL', r.id, req.user!.id)
    )
      throw new HttpError(403, 'Присоединитесь к комнате.');
    run(
      'UPDATE room_members SET ready=?,last_seen=? WHERE room_id=? AND user_id=?',
      Number(b.ready),
      now(),
      r.id,
      req.user!.id,
    );
    broadcast();
    return roomView(r.id, req.user!.id);
  });
  route('post', '/rooms/:id/start', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    if (r.host_id !== req.user!.id) throw new HttpError(403, 'Игру запускает ведущий.');
    if (r.phase !== 'lobby') throw new HttpError(409, 'Игра уже запущена.');
    const players = all(
      'SELECT * FROM room_members WHERE room_id=? AND left_at IS NULL ORDER BY joined_at,user_id',
      r.id,
    );
    if (players.length < 3) throw new HttpError(400, 'Для «Шпиона» нужны минимум 3 игрока.');
    if (players.some((p) => !p.ready || !isOnline(p)))
      throw new HttpError(400, 'Все игроки должны быть онлайн и готовы.');
    const topics = all(
      'SELECT r.*,c.name AS category FROM rules r JOIN categories c ON c.id=r.category_id WHERE r.published=1',
    ).filter((r) => JSON.parse(r.games).includes('spy'));
    if (!topics.length)
      throw new HttpError(400, 'Нет опубликованных тем для «Шпиона». Добавьте правило в админке.');
    const topic = topics[randomInt(topics.length)],
      spy = players[randomInt(players.length)].user_id,
      sid = randomUUID();
    transaction(db, () => {
      run(
        'INSERT INTO game_sessions(id,room_id,topic_title,topic_category,topic_snapshot,spy_id,started_at) VALUES(?,?,?,?,?,?,?)',
        sid,
        r.id,
        topic.title,
        topic.category,
        JSON.stringify({ title: topic.title, category: topic.category, explanation: topic.explanation }),
        spy,
        stamp(),
      );
      for (const p of players)
        run('INSERT INTO game_players VALUES(?,?,?)', sid, p.user_id, p.user_id === spy ? 'spy' : 'citizen');
      run(
        "UPDATE rooms SET phase='discussion',deadline=?,session_id=?,round=round+1 WHERE id=?",
        now() + r.discussion_seconds * 1000,
        sid,
        r.id,
      );
    });
    broadcast();
    return roomView(r.id, req.user!.id);
  });
  route('post', '/rooms/:id/advance', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    advanceExpired(r);
    const updated = get('SELECT * FROM rooms WHERE id=?', r.id);
    if (updated.host_id !== req.user!.id)
      throw new HttpError(403, 'Только ведущий может завершить обсуждение.');
    if (updated.phase !== 'discussion') throw new HttpError(409, 'Обсуждение уже завершено.');
    run("UPDATE rooms SET phase='voting',deadline=? WHERE id=?", now() + updated.vote_seconds * 1000, r.id);
    broadcast();
    return roomView(r.id, req.user!.id);
  });
  route('post', '/rooms/:id/vote', (req) => {
    let r = roomFor(String(req.params.id), req.user!.id);
    advanceExpired(r);
    r = get('SELECT * FROM rooms WHERE id=?', r.id);
    participant(r, req.user!.id);
    if (r.phase !== 'voting') throw new HttpError(409, 'Сейчас голосование закрыто.');
    const target = str(body(req).targetId, 'Игрок', 1, 100);
    if (!get('SELECT 1 FROM game_players WHERE session_id=? AND user_id=?', r.session_id, target))
      throw new HttpError(400, 'Цель не участвует в раунде.');
    if (get('SELECT 1 FROM game_votes WHERE session_id=? AND voter_id=?', r.session_id, req.user!.id))
      throw new HttpError(409, 'Ваш голос уже учтён.');
    run('INSERT INTO game_votes VALUES(?,?,?,?)', r.session_id, req.user!.id, target, stamp());
    const count = get('SELECT count(*) AS n FROM game_votes WHERE session_id=?', r.session_id).n,
      size = get('SELECT count(*) AS n FROM game_players WHERE session_id=?', r.session_id).n;
    if (count === size) resolveVoting(r);
    broadcast();
    return roomView(r.id, req.user!.id);
  });
  route('post', '/rooms/:id/guess', (req) => {
    let r = roomFor(String(req.params.id), req.user!.id);
    advanceExpired(r);
    r = get('SELECT * FROM rooms WHERE id=?', r.id);
    participant(r, req.user!.id);
    if (!['discussion', 'voting', 'guess'].includes(r.phase))
      throw new HttpError(409, 'Время ответа шпиона ещё не началось или уже закончилось.');
    const session = get('SELECT * FROM game_sessions WHERE id=?', r.session_id);
    if (session.spy_id !== req.user!.id) throw new HttpError(403, 'Ответить может только шпион.');
    if (session.guess !== null) throw new HttpError(409, 'Ответ уже принят.');
    const answer = str(body(req).answer, 'Тема', 1, 300);
    run('UPDATE game_sessions SET guess=? WHERE id=?', answer, session.id);
    const correct = matchesSpyTopic(answer, session.topic_title);
    finish(
      r,
      correct ? 'spy' : 'citizens',
      correct
        ? 'Шпион правильно назвал тему и выиграл.'
        : 'Шпион найден и не угадал тему. Победа мирных игроков.',
    );
    return roomView(r.id, req.user!.id);
  });
  route('post', '/rooms/:id/next', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    if (r.host_id !== req.user!.id) throw new HttpError(403, 'Следующий раунд открывает ведущий.');
    if (r.phase !== 'finished') throw new HttpError(409, 'Дождитесь завершения текущего раунда.');
    transaction(db, () => {
      run("UPDATE rooms SET phase='lobby',deadline=NULL,session_id=NULL WHERE id=?", r.id);
      run('UPDATE room_members SET ready=0 WHERE room_id=?', r.id);
    });
    broadcast();
    return roomView(r.id, req.user!.id);
  });
  route('get', '/rooms/:id/messages', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    participant(r, req.user!.id);
    return all(
      'SELECT m.id,m.text,m.user_id AS userId,u.username,u.avatar,m.created_at AS createdAt FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 100',
      r.id,
    ).reverse();
  });
  route('post', '/rooms/:id/messages', (req) => {
    const r = roomFor(String(req.params.id), req.user!.id);
    participant(r, req.user!.id);
    const text = str(body(req).text, 'Сообщение', 1, 500);
    const recent = get(
      'SELECT created_at FROM messages WHERE room_id=? AND user_id=? ORDER BY rowid DESC LIMIT 1',
      r.id,
      req.user!.id,
    );
    if (recent && now() - Date.parse(recent.created_at) < 800)
      throw new HttpError(429, 'Слишком быстро. Подождите секунду.');
    const msg = {
      id: randomUUID(),
      userId: req.user!.id,
      username: req.user!.username,
      avatar: req.user!.avatar,
      text,
      createdAt: stamp(),
    };
    run('INSERT INTO messages VALUES(?,?,?,?,?)', msg.id, r.id, msg.userId, text, msg.createdAt);
    touch(r.id, req.user!.id);
    broadcast();
    return msg;
  });
  // Server deletion preserves session/result snapshots through ON DELETE SET NULL.
  app.get('/api/admin/servers', requireAuth, ctx.requireRole('admin', 'moderator'), (_req, res) =>
    res.json(all('SELECT * FROM servers ORDER BY created_at DESC').map(serverBase)),
  );
  app.delete('/api/admin/servers/:id', requireAuth, ctx.requireRole('admin'), (req, res) => {
    const sid = String(req.params.id);
    const s = get('SELECT * FROM servers WHERE id=?', sid);
    if (!s) throw new HttpError(404, 'Сервер не найден.');
    if (get("SELECT 1 FROM rooms WHERE server_id=? AND phase IN ('discussion','voting','guess')", sid))
      throw new HttpError(409, 'Дождитесь завершения активных игр перед удалением сервера.');
    transaction(db, () => {
      run('DELETE FROM servers WHERE id=?', sid);
      audit(req.user!.id, 'server.delete', sid);
    });
    broadcast();
    res.json({});
  });
  return { tick, close: () => {} };
}
