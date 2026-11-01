import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
const source = resolve(process.env.DATABASE_PATH || 'data/royale.sqlite');
if (!existsSync(source)) throw new Error('База не найдена. Сначала запустите приложение.');
const uploads = resolve(process.env.UPLOADS_DIR || join(dirname(source), 'uploads'));
const target = resolve(dirname(source), 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(target, { recursive: true });
const db = new DatabaseSync(source);
try {
  db.prepare('VACUUM INTO ?').run(join(target, 'royale.sqlite'));
} finally {
  db.close();
}
if (existsSync(uploads))
  cpSync(uploads, join(target, 'uploads'), { recursive: true, errorOnExist: true, force: false });
writeFileSync(
  join(target, 'backup.json'),
  JSON.stringify(
    { createdAt: new Date().toISOString(), database: 'royale.sqlite', uploads: 'uploads', format: 1 },
    null,
    2,
  ),
);
console.log(`Резервная копия сохранена: ${target}`);
