// Серверные правила контента «Alias»: проверка карточек, снимок для матча, адаптер учебных заданий.

import { MIN_CARDS, parseCard, type BaseTask, type Card, type Content, type Parsed } from "../../../shared/games/alias/types";
import { answerKey, explanationDictionary, findForbidden, FUNCTION_WORDS, tokenize } from "../../../shared/games/alias/text";

export type Item = Card;

export const ITEM_LABEL = "карточка";
export const MIN_PUBLISHED_FOR_START = MIN_CARDS;

export interface Review {
  errors: string[];
  warnings: string[];
}

export function parseItem(raw: unknown): Parsed<Item> {
  return parseCard(raw);
}

export function itemTitle(item: Item): string {
  return item.term;
}

/** Запреты, из-за которых объяснить карточку почти невозможно. */
function blockingRules(card: Card): string[] {
  const problems: string[] = [];
  for (const entry of [...card.forbiddenForms, ...card.forbiddenPhrases]) {
    const prefix = entry.trim().endsWith("*");
    const tokens = tokenize(prefix ? entry.trim().slice(0, -1) : entry);
    if (tokens.length === 1 && FUNCTION_WORDS.has(tokens[0] ?? "")) problems.push(`«${entry}» — служебное слово: без него почти не объяснить`);
    if (prefix && tokens.join("").length < 3) problems.push(`«${entry}» — слишком короткий корень, заблокирует обычные слова`);
  }
  return problems;
}

export function reviewItem(item: Item, others: readonly Item[]): Review {
  const review: Review = { errors: [], warnings: [] };
  review.errors.push(...blockingRules(item));
  const answers = [item.term, ...item.acceptedAnswers];
  const tooShort = answers.filter((answer) => answerKey(answer).replace(/ /g, "").length < 2);
  if (tooShort.length > 0) review.errors.push(`Ответ невозможно объяснить и проверить: ${tooShort.join(", ")}`);
  if (!item.acceptedAnswers.some((answer) => answerKey(answer) === answerKey(item.term))) {
    review.warnings.push("Сам термин не указан среди допустимых ответов (он всё равно принимается)");
  }
  const phrases = item.forbiddenPhrases.filter((p) => !answers.some((a) => answerKey(a) === answerKey(p.replace(/\*$/, ""))));
  if (phrases.length < 3) review.errors.push("Нужно минимум 3 запрещённые фразы помимо самого термина");
  const duplicate = others.find((other) => other.id !== item.id && answerKey(other.term) === answerKey(item.term));
  if (duplicate) review.warnings.push(`Карточка с таким термином уже есть (${duplicate.id})`);
  return review;
}

/** Предпросмотр фильтра для редактора: что сработает в объяснении. */
export function previewFilter(item: Item, explanation: string): string | null {
  return findForbidden(explanation, explanationDictionary(item));
}

export function buildContent(items: readonly Item[], nowMs: number): Content {
  return { takenAt: nowMs, cards: items.map((item) => structuredClone(item)) };
}

/**
 * Адаптер из нормализованного учебного задания: черновик карточки.
 * Термин — первый правильный ответ, определение — explanation. Запрещённые фразы редактор добавляет сам.
 */
export function draftFromBaseTask(task: BaseTask, category: string, forbiddenPhrases: readonly string[]): Parsed<Item> {
  if (task.status !== "published") return { ok: false, error: "Задание не опубликовано" };
  const term = task.acceptedAnswers[0] ?? "";
  return parseCard({
    term,
    acceptedAnswers: [...new Set(task.acceptedAnswers)],
    forbiddenPhrases: [...forbiddenPhrases],
    forbiddenForms: [],
    definition: task.explanation,
    difficulty: Math.min(3, Math.max(1, Math.round(task.difficulty))) as 1 | 2 | 3,
    category,
  });
}
