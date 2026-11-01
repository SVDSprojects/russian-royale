import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const base = 'http://127.0.0.1:4175';
const clients = [];
async function call(client, path, data, method = data === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      ...(client ? { Cookie: client.cookie } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(body)}`);
  return { body, response };
}
if (process.argv.includes('--restore')) {
  const saved = JSON.parse(readFileSync('data/cloudflare-test-receipt.json', 'utf8'));
  const state = (await call(saved.client, '/rooms/' + saved.roomId)).body;
  assert.equal(state.phase, 'finished');
  assert.ok(state.result);
  console.log('Cloudflare persistence across restart: PASS');
  process.exit(0);
}
for (let i = 0; i < 3; i++) {
  const account = await call(
    null,
    '/auth/register',
    { email: `cf-${randomUUID()}@royale.test`, username: `Проверка ${i}`, password: randomUUID() },
    'POST',
    201,
  );
  clients.push({
    id: account.body.user.id,
    cookie: account.response.headers.get('set-cookie').split(';')[0],
  });
}
await call(null, '/admin/rules', undefined, 'GET', 401);
await call(clients[0], '/admin/rules', undefined, 'GET', 403);
const rules = (await call(null, '/rules')).body;
assert.equal(rules.length, 1);
const server = (await call(clients[0], '/servers', { name: 'Проверка Cloudflare' })).body;
const invite = (await call(clients[0], `/servers/${server.id}/invites`, {})).body;
for (const c of clients.slice(1)) await call(c, `/invites/${invite.token}/join`, {});
const room = (
  await call(clients[0], `/servers/${server.id}/rooms`, {
    name: 'Тест',
    maxPlayers: 3,
    discussionSeconds: 30,
    voteSeconds: 15,
    guessSeconds: 15,
  })
).body;
for (const c of clients.slice(1)) await call(c, `/rooms/${room.id}/join`, {});
for (const c of clients) await call(c, `/rooms/${room.id}/ready`, { ready: true });
const version = (await call(clients[1], '/updates')).body.version;
const notification = call(clients[1], '/updates?after=' + encodeURIComponent(version));
await new Promise((r) => setTimeout(r, 200));
await call(clients[0], `/rooms/${room.id}/start`, {});
assert.notEqual((await notification).body.version, version);
const states = await Promise.all(clients.map(async (c) => (await call(c, `/rooms/${room.id}`)).body));
const spy = states.findIndex((s) => s.me.role === 'spy');
assert.equal(states.filter((s) => s.me.role === 'spy').length, 1);
assert.equal(states[spy].me.topic, undefined);
await call(clients[0], `/rooms/${room.id}/messages`, { text: 'Привет из облака' });
await call(clients[0], `/rooms/${room.id}/advance`, {});
for (const c of clients) await call(c, `/rooms/${room.id}/vote`, { targetId: clients[spy].id });
await call(clients[spy], `/rooms/${room.id}/guess`, { answer: 'Неверный ответ' });
const finished = (await call(clients[0], `/rooms/${room.id}`)).body;
assert.equal(finished.phase, 'finished');
assert.ok(finished.result);
const csrf = await fetch(base + '/api/servers', {
  method: 'POST',
  headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Cookie: clients[0].cookie },
  body: '{}',
});
assert.equal(csrf.status, 403);
const promoted = await call(clients[0], '/admin/bootstrap', {
  token: 'local-cloudflare-test-bootstrap-only-2026',
});
assert.equal(promoted.body.user.role, 'admin');
const png = readFileSync('public/assets/teacher-neutral.png');
const upload = (
  await call(
    clients[0],
    '/admin/uploads',
    { data: 'data:image/png;base64,' + png.toString('base64') },
    'POST',
    201,
  )
).body;
const image = await fetch(base + upload.url);
assert.equal(image.status, 200);
assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
await call(
  clients[0],
  '/admin/uploads',
  { data: 'data:image/png;base64,' + Buffer.from('invalid').toString('base64') },
  'POST',
  400,
);
mkdirSync('artifacts', { recursive: true });
writeFileSync('data/cloudflare-test-receipt.json', JSON.stringify({ client: clients[0], roomId: room.id }));
writeFileSync(
  'artifacts/cloudflare-check.json',
  JSON.stringify(
    {
      passed: true,
      date: new Date().toISOString(),
      accounts: 3,
      game: true,
      longPolling: true,
      authorization: true,
      csrf: true,
      upload: true,
    },
    null,
    2,
  ),
);
console.log('Cloudflare account / permissions / 3-player game / long polling / upload: PASS');
