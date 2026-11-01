// Серверные правила контента «Самозванца»: проверка пар, снимок для матча, адаптер учебных заданий.

import { parsePair, type BaseTask, type Content, type Pair, type Parsed, type Topic } from "../../../shared/games/impostor/types";
import { findForbidden, tokenize } from "../../../shared/games/impostor/text";

export type Item = Pair;

export const ITEM_LABEL = "пара тем";
export const MIN_PUBLISHED_FOR_START = 1;

export interface Review {
  errors: string[];
  warnings: string[];
}

export function parseItem(raw: unknown): Parsed<Item> {
  return parsePair(raw);
}

export function itemTitle(item: Item): string {
  return item.title;
}

const STOP_WORDS = new Set(["в", "во", "и", "на", "с", "со", "после", "перед", "без", "при", "для", "у", "о", "об", "от", "по", "к", "из", "за"]);

function reviewTopic(topic: Topic, label: string, review: Review): void {
  const blocked = topic.examples.filter((example) => findForbidden(example, topic.forbiddenWords) !== null);
  if (blocked.length > 0) {
    review.errors.push(`${label}: примеры каталога нарушают собственный словарь — ${blocked.join(", ")}`);
  }
  const covered = (word: string) => findForbidden(word, topic.forbiddenWords) !== null;
  const titleWords = tokenize(topic.title).filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  const missing = titleWords.filter((word) => !covered(word));
  if (missing.length > 0) {
    review.warnings.push(`${label}: слова названия не в словаре запретов — ${missing.join(", ")}`);
  }
  const tooShort = topic.forbiddenWords.filter((entry) => entry.endsWith("*") && tokenize(entry.slice(0, -1)).join("").length < 3);
  if (tooShort.length > 0) {
    review.warnings.push(`${label}: слишком короткий префикс запрета (${tooShort.join(", ")}) заблокирует обычные слова`);
  }
}

export function reviewItem(item: Item, others: readonly Item[]): Review {
  const review: Review = { errors: [], warnings: [] };
  reviewTopic(item.a, "Тема A", review);
  reviewTopic(item.b, "Тема B", review);
  const sameTitle = tokenize(item.a.title).join(" ") === tokenize(item.b.title).join(" ");
  if (sameTitle) review.errors.push("Темы A и B не должны совпадать");
  const shared = item.a.examples.filter((e) => item.b.examples.some((f) => tokenize(f).join(" ") === tokenize(e).join(" ")));
  if (shared.length > 0) review.errors.push(`Один пример в обеих темах: ${shared.join(", ")}`);
  const key = tokenize(item.title).join(" ");
  const duplicate = others.find((other) => other.id !== item.id && tokenize(other.title).join(" ") === key);
  if (duplicate) review.warnings.push(`Пара с таким названием уже есть (${duplicate.id})`);
  return review;
}

export function buildContent(items: readonly Item[], nowMs: number): Content {
  return { takenAt: nowMs, pairs: items.map((item) => structuredClone(item)) };
}

/**
 * Адаптер из нормализованных учебных заданий: два правила → черновик пары.
 * Примеры берутся из acceptedAnswers, описание — из explanation. Результат требует проверки редактором.
 */
export function draftFromBaseTasks(
  ruleA: { title: string; tasks: readonly BaseTask[] },
  ruleB: { title: string; tasks: readonly BaseTask[] },
  difference: string,
): Parsed<Item> {
  const topicFrom = (rule: { title: string; tasks: readonly BaseTask[] }) => {
    const published = rule.tasks.filter((task) => task.status === "published");
    const examples = [...new Set(published.flatMap((task) => task.acceptedAnswers))].slice(0, 8);
    const description = published.map((task) => task.explanation).find((text) => text.trim().length >= 10) ?? "";
    const forbiddenWords = tokenize(rule.title)
      .filter((word) => !STOP_WORDS.has(word))
      .map((word) => (word.length >= 6 ? `${word.slice(0, word.length - 2)}*` : word));
    return { title: rule.title, description, examples, forbiddenWords };
  };
  return parsePair({ title: `${ruleA.title} / ${ruleB.title}`, difference, a: topicFrom(ruleA), b: topicFrom(ruleB) });
}
