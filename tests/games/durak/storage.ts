// Только локальная реализация контракта существующего server/storage.ts.
import { DatabaseSync } from "node:sqlite";
export type { DB } from "../../../server/storage";
import type { DB } from "../../../server/storage";
export function openDB(path: string): DB {
  const db = new DatabaseSync(path);
  return {
    prepare(sql) {
      const q = db.prepare(sql);
      return {
        get(...params: unknown[]) {
          return q.get(...(params as (string | number | null)[]));
        },
        all(...params: unknown[]) {
          return q.all(...(params as (string | number | null)[]));
        },
        run(...params: unknown[]) {
          return q.run(...(params as (string | number | null)[]));
        },
      };
    },
    exec(sql) {
      db.exec(sql);
    },
    close() {
      db.close();
    },
  };
}
export function transaction<T>(db: DB, callback: () => T): T {
  if (db.transactionSync) return db.transactionSync(callback);
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = callback();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
