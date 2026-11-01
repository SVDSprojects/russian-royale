import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createDatabase } from './db.js';
import { id, iso } from './core.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Использование: npm run admin -- ваш@email.ru\nСначала зарегистрируйте аккаунт на сайте.');
  process.exit(1);
}
const path = process.env.DATABASE_PATH || resolve('data/royale.sqlite');
if (!existsSync(path)) {
  console.error('База не найдена. Сначала запустите сайт и зарегистрируйте аккаунт.');
  process.exit(1);
}
const db = createDatabase(path);
try {
  const user = db.prepare('SELECT id,username FROM users WHERE email=?').get(email);
  if (!user) {
    console.error('Аккаунт не найден. Сначала зарегистрируйтесь на сайте с этим email.');
    process.exitCode = 1;
  } else {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
      db.prepare('INSERT INTO audit_log(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)').run(
        id(),
        user.id,
        'admin.local-cli',
        user.id,
        iso(),
      );
      db.exec('COMMIT');
      console.log(`Администратор назначен: ${user.username}. Обновите страницу /admin.html.`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
} finally {
  db.close();
}
