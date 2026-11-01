// Серверные правила контента «Кто я»: проверка терминов, снимок для матча, адаптер учебных заданий.

import { parseTerm, type BaseTask, type Content, type Difficulty, type Parsed, type Term } from "../../../shared/games/whoami/types";
import { normalizeAnswer } from "../../../shared/games/whoami/text";

export type Item = Term;

export const ITEM_LABEL = "термин";
/** Для старта нужно не меньше терминов, чем игроков; минимум состава — 3. */
export const MIN_PUBLISHED_FOR_START = 3;

export interface Review {
  errors: string[];
  warnings: string[];
}

export function parseItem(raw: unknown): Parsed<Item> {
  return parseTerm(raw);
}

export function itemTitle(item: Item): string {
  return item.term;
}

const key = (text: string) => normalizeAnswer(text, true);

/** Ошибки блокируют публикацию, замечания — нет. */
export function reviewItem(item: Item, others: readonly Item[]): Review {
  const review: Review = { errors: [], warnings: [] };
  if (item.definition.trim().length === 0) review.errors.push("Пустое определение — его покажут в финале, без него публиковать нельзя");
  else if (item.definition.length < 20) review.warnings.push("Очень короткое определение: объясните термин содержательно");
  const variants = [item.term, ...item.acceptedAnswers];
  const seen = new Set<string>();
  for (const variant of variants) {
    const k = normalizeAnswer(variant, item.equivalenceYo);
    if (seen.has(k)) review.warnings.push(`Вариант «${variant}» повторяется`);
    seen.add(k);
  }
  if (!item.equivalenceYo && variants.some((v) => v.toLocaleLowerCase("ru-RU").includes("ё"))) {
    review.warnings.push("В ответе есть «ё», но ё/е не приравнены: игрок, написавший «е», не угадает");
  }
  const own = new Set(variants.map(key));
  for (const other of others) {
    if (other.id === item.id) continue;
    const theirs = [other.term, ...other.acceptedAnswers].map(key);
    if (key(other.term) === key(item.term)) review.warnings.push(`Совпадает с термином «${other.term}» (${other.id})`);
    else if (theirs.some((k) => own.has(k))) review.warnings.push(`Вариант ответа пересекается с термином «${other.term}» (${other.id})`);
  }
  return review;
}

export function buildContent(items: readonly Item[], takenAt: number): Content {
  return { takenAt, terms: items.map((item) => structuredClone(item)) };
}

/**
 * Адаптер из нормализованного учебного задания в черновик термина.
 * Термин — первый правильный ответ, остальные — варианты, определение — explanation. Нужна проверка редактором.
 */
export function draftFromBaseTask(task: BaseTask, category: string): Parsed<Item> | null {
  if (task.status !== "published") return null;
  const [term, ...rest] = task.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean);
  if (!term) return null;
  const difficulty = Math.min(3, Math.max(1, Math.round(task.difficulty))) as Difficulty;
  return parseTerm({
    term,
    definition: task.explanation,
    acceptedAnswers: rest,
    difficulty,
    category,
    equivalenceYo: term.toLocaleLowerCase("ru-RU").includes("ё"),
  });
}
