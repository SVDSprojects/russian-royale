/** One temporary diagnostic account/server; never touches real users' records. */
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.argv[2];
assert.ok(
  base?.startsWith('https://') && base === process.env.PUBLIC_ORIGIN,
  'Pass the configured PUBLIC_ORIGIN.',
);
const email = `connection-check-${randomUUID()}@royale.test`;
let cookie = '',
  userId = '',
  serverId = '';
async function call(path: string, data?: unknown) {
  const response = await fetch(base + '/api' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  assert.ok(response.ok, `${path}: ${response.status}`);
  return { body, response };
}
try {
  const account = await call('/auth/register', {
    email,
    username: 'Диагностика соединения',
    password: randomBytes(32).toString('base64url'),
  });
  userId = account.body.user.id;
  cookie = account.response.headers.get('set-cookie')!.split(';')[0];
  assert.ok(account.response.headers.get('set-cookie')?.includes('Secure'), 'HTTPS cookie expected');
  const initial = (await call('/updates')).body;
  const start = performance.now();
  const pending = call('/updates?after=' + encodeURIComponent(initial.version));
  await new Promise((resolve) => setTimeout(resolve, 300));
  serverId = (await call('/servers', { name: 'Диагностика соединения (временно)' })).body.id;
  const updated = (await pending).body;
  assert.notEqual(updated.version, initial.version);
  assert.deepEqual(Object.keys(updated).sort(), ['serverNow', 'version']);
  const report = {
    date: new Date().toISOString(),
    url: base,
    passed: true,
    httpsAuth: true,
    secureCookie: true,
    authenticatedLongPolling: true,
    elapsedMs: Math.round(performance.now() - start),
  };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/public-connectivity.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  const db = new DatabaseSync(process.env.DATABASE_PATH || 'data/royale.sqlite');
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    if (serverId) db.prepare('DELETE FROM servers WHERE id=? AND owner_id=?').run(serverId, userId);
    if (userId) db.prepare('DELETE FROM users WHERE id=? AND email=?').run(userId, email);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.close();
  }
}
