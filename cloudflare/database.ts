import type { DB } from '../server/storage';

export function durableDatabase(storage: DurableObjectStorage): DB {
  return {
    prepare(query: string) {
      const run = (...params: any[]) => storage.sql.exec(query, ...params);
      return {
        get: (...params) => run(...params).toArray()[0],
        all: (...params) => run(...params).toArray(),
        run: (...params) => {
          run(...params).toArray();
          const row = storage.sql.exec('SELECT changes() AS changes, last_insert_rowid() AS id').one();
          return { changes: Number(row.changes), lastInsertRowid: Number(row.id) };
        },
      };
    },
    exec: (query) => {
      storage.sql.exec(query).toArray();
    },
    close() {},
    transactionSync: (action) => storage.transactionSync(action),
  };
}
