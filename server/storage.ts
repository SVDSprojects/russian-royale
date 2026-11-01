/** Shared synchronous storage contract for Node SQLite and Cloudflare Durable Objects. */
export interface DB {
  prepare(sql: string): {
    get(...params: any[]): any;
    all(...params: any[]): any[];
    run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
  close(): void;
  transactionSync?<T>(action: () => T): T;
}
export function transaction<T>(db: DB, action: () => T): T {
  if (db.transactionSync) return db.transactionSync(action);
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
