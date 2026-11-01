/** One-time migration. Secrets remain in memory and enter Wrangler through stdin. */
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { snapshotTables } from '../cloudflare/snapshot';
import assert from 'node:assert/strict';
const origin = process.argv[2];
assert.equal(origin, 'https://russian-royale.russian-royale.workers.dev');
assert.equal(readdirSync('data/uploads').length, 0, 'Uploaded files need a separate migration.');
const token = randomBytes(48).toString('base64url');
function wrangler(args: string[], input?: string) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  if (result.status !== 0) throw new Error('Cloudflare operation failed: ' + result.stderr);
}
const db = new DatabaseSync('data/royale.sqlite');
mkdirSync('data/backups', { recursive: true });
const backup = `data/backups/before-cloudflare-${Date.now()}.sqlite`;
db.prepare('VACUUM INTO ?').run(backup);
const snapshot: Record<string, any[]> = {};
db.exec('BEGIN');
try {
  for (const table of snapshotTables) snapshot[table] = db.prepare(`SELECT * FROM "${table}"`).all();
} finally {
  db.exec('COMMIT');
  db.close();
}
console.log('Consistent backup created; importing', snapshot.users.length, 'accounts.');
wrangler(['secret', 'put', 'MIGRATION_TOKEN'], token);
try {
  const send = () => fetch(origin + '/api/_migration', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
    signal: AbortSignal.timeout(60000),
  });
  let response = await send();
  for (let attempt = 0; response.status === 404 && attempt < 20; attempt++) {
    await response.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, 1500));
    response = await send();
  }
  const text = await response.text();
  assert.ok(text, `Migration returned HTTP ${response.status} with no body`);
  const result = JSON.parse(text);
  assert.ok(response.ok, JSON.stringify(result));
  assert.equal(result.users, snapshot.users.length);
  assert.equal(result.rooms, snapshot.rooms.length);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/cloudflare-migration.json',
    JSON.stringify({ ...result, origin, backup, completedAt: new Date().toISOString() }, null, 2),
  );
  console.log('Migration verified:', JSON.stringify(result));
} finally {
  wrangler(['secret', 'delete', 'MIGRATION_TOKEN'], 'y\n');
  console.log('Temporary migration credential removed.');
}
