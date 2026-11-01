/** Thirty actual cookie-authenticated HTTP/SSE connections to a real listener.
 * Uses an isolated in-memory DB, with production middleware/timers enabled.
 * This is a single-machine synchronization smoke test, not a WAN benchmark.
 */
import { createApp } from '../server/app';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const instance = createApp({ dbPath: ':memory:', testMode: false, uploadsDir: 'data/load-uploads' });
const listener = instance.app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => listener.once('listening', resolve));
const address = listener.address() as { port: number },
  base = `http://127.0.0.1:${address.port}`;
type Client = { cookie: string; id: string; events: number; updates: number; abort: AbortController };
const clients: Client[] = [],
  durations: number[] = [];
let roomId = '';
const streams: Promise<void>[] = [];
const polling = process.argv.includes('--poll');
async function call(
  c: Client | null,
  path: string,
  data?: unknown,
  method = data === undefined ? 'GET' : 'POST',
) {
  const start = performance.now();
  const response = await fetch(base + '/api' + path, {
    method,
    headers: { ...(c ? { Cookie: c.cookie } : {}), 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  durations.push(performance.now() - start);
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return { result, response };
}
async function until(predicate: () => boolean, timeout = 10000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for realtime clients');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}
async function open(c: Client) {
  const controller = c.abort;
  if (polling) {
    let version = '';
    try {
      while (!controller.signal.aborted) {
        const response = await fetch(base + '/api/updates?after=' + encodeURIComponent(version), {
          headers: { Cookie: c.cookie },
          signal: controller.signal,
        });
        assert.equal(response.status, 200);
        const event = await response.json();
        assert.deepEqual(Object.keys(event).sort(), ['serverNow', 'version']);
        if (event.version !== version) {
          c.events++;
          c.updates++;
        }
        version = event.version;
      }
    } catch (e) {
      if (!controller.signal.aborted) throw e;
    }
    return;
  }
  const response = await fetch(base + '/api/events', {
    headers: { Cookie: c.cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  let tail = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      tail += new TextDecoder().decode(value);
      const events = tail.split('\n\n');
      tail = events.pop()!;
      for (const event of events)
        if (event.includes('event: update')) {
          c.events++;
          if (roomId) c.updates++;
          assert.ok(!event.includes('topic') && !event.includes('spy'), 'Secrets in broadcast');
        }
    }
  } catch (e) {
    if (!controller.signal.aborted) throw e;
  }
}
try {
  for (let i = 0; i < 30; i++) {
    const { response, result } = await call(null, '/auth/register', {
      email: `load-${i}@royale.test`,
      username: `Игрок ${i + 1}`,
      password: 'Isolated-test-password-2026!',
    });
    clients.push({
      cookie: response.headers.get('set-cookie')!.split(';')[0],
      id: result.user.id,
      events: 0,
      updates: 0,
      abort: new AbortController(),
    });
  }
  const host = clients[0],
    server = (await call(host, '/servers', { name: '30 живых подключений' })).result,
    invite = (await call(host, `/servers/${server.id}/invites`, {})).result;
  await Promise.all(clients.slice(1).map((c) => call(c, `/invites/${invite.token}/join`, {})));
  const room = (
    await call(host, `/servers/${server.id}/rooms`, {
      name: 'Проверка синхронизации',
      maxPlayers: 30,
      discussionSeconds: 90,
      voteSeconds: 30,
      guessSeconds: 20,
    })
  ).result;
  roomId = room.id;
  await Promise.all(clients.map((c) => call(c, `/rooms/${roomId}/join`, {})));
  for (const c of clients) streams.push(open(c));
  await until(() => clients.every((c) => c.events > 0));
  await Promise.all(clients.map((c) => call(c, `/rooms/${roomId}/ready`, { ready: true })));
  const before = clients.map((c) => c.events);
  const started = performance.now();
  await call(host, `/rooms/${roomId}/start`, {});
  await until(() => clients.every((c, i) => c.events > before[i]));
  const propagation = performance.now() - started;
  const views = await Promise.all(clients.map(async (c) => (await call(c, `/rooms/${roomId}`)).result));
  assert.equal(views.filter((v) => v.me.role === 'spy').length, 1);
  assert.equal(new Set(views.map((v) => v.sessionId)).size, 1);
  assert.ok(views.every((v) => v.players.length === 30));
  const spy = views.findIndex((v) => v.me.role === 'spy'),
    citizen = views.findIndex((v) => v.me.role === 'citizen');
  assert.equal(views[spy].me.topic, undefined);
  // Drop and reconnect one network stream; its role and session must persist.
  clients[7].abort.abort();
  clients[7].abort = new AbortController();
  const old = clients[7].events;
  streams.push(open(clients[7]));
  await until(() => clients[7].events > old);
  const restored = (await call(clients[7], `/rooms/${roomId}/join`, {})).result;
  assert.equal(restored.sessionId, views[7].sessionId);
  assert.equal(restored.me.role, views[7].me.role);
  await call(host, `/rooms/${roomId}/advance`, {});
  await Promise.all(clients.map((c) => call(c, `/rooms/${roomId}/vote`, { targetId: clients[citizen].id })));
  const final = await Promise.all(clients.map(async (c) => (await call(c, `/rooms/${roomId}`)).result));
  assert.ok(final.every((v) => v.phase === 'finished' && v.result.winner === 'spy'));
  assert.equal(instance.db.prepare('SELECT count(*) n FROM game_results').get().n, 30);
  const sorted = durations.toSorted((a, b) => a - b);
  const report = {
    date: new Date().toISOString(),
    connections: 30,
    transport: polling ? 'HTTP + authenticated JSON long polling' : 'HTTP + authenticated SSE',
    environment: 'single Windows machine / local loopback / one Node process / in-memory SQLite',
    rateLimits: 'enabled',
    passed: true,
    phaseDeliveryMs: Math.round(propagation),
    requestCount: durations.length,
    requestP95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
    reconnectVerified: true,
    resultsSaved: 30,
    minimumEventsPerConnection: Math.min(...clients.map((c) => c.events)),
    limitations: 'Not 30 physical devices, no WAN/mobile latency or long-term stress testing.',
  };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    polling ? 'artifacts/load-test-poll.json' : 'artifacts/load-test.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const c of clients) c.abort.abort();
  await Promise.allSettled(streams);
  instance.close();
  listener.closeAllConnections();
  await new Promise<void>((resolve) => listener.close(() => resolve()));
}
