// Серверная точка входа модуля «Кто я» (RR Game Module v1).

import type { Express } from "express";
import type { DB } from "../../storage";
import { transaction } from "../../storage";
import { parseItem, reviewItem } from "./content";
import { createRoutes, type ModuleContext, type Registration } from "./routes";
import { migrate } from "./schema";
import { Store } from "./store";

export { migrate } from "./schema";
export { API_PREFIX, secureRandomInt, type AuthUser, type ModuleContext, type Registration, type ResultMeta } from "./routes";
export * as engine from "./engine";

/** Подключает маршруты /api/games/whoami. Таймеры не запускает: tick вызывает хост (Node-таймер или DO alarm). */
export function register(app: Express, ctx: ModuleContext): Registration {
  return createRoutes(app, ctx);
}

export interface SeedReport {
  inserted: number;
  skipped: number;
  rejected: string[];
}

/**
 * Импорт авторского набора в пустую или частично заполненную таблицу.
 * Существующие записи с тем же id не перезаписываются. Публикуются только записи без ошибок.
 */
export function seedContent(db: DB, entries: readonly unknown[], updatedBy: string, nowMs: number, publish: boolean): SeedReport {
  migrate(db);
  const store = new Store(db);
  const report: SeedReport = { inserted: 0, skipped: 0, rejected: [] };
  transaction(db, () => {
    for (const entry of entries) {
      const parsed = parseItem(entry);
      if (!parsed.ok) {
        report.rejected.push(parsed.error);
        continue;
      }
      if (!parsed.value.id || store.getContent(parsed.value.id)) {
        report.skipped += 1;
        continue;
      }
      const item = { ...parsed.value, revision: 1 };
      const errors = reviewItem(item, store.listContent().map((row) => row.item)).errors;
      store.insertContent({
        id: item.id,
        status: publish && errors.length === 0 ? "published" : "draft",
        revision: 1,
        item,
        createdAt: nowMs,
        updatedAt: nowMs,
        updatedBy,
      });
      report.inserted += 1;
    }
  });
  return report;
}
