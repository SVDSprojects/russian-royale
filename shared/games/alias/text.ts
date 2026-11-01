// Нормализация, сравнение ответов и фильтр запретов. Чистые функции без контента.
// Морфологического анализа нет: формы и корни для запрета задаёт редактор.

/** NFKC, нижний регистр, ё→е, всё кроме букв и цифр — разделитель (границы слов). */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/** Ключ для сравнения ответа: регистр, ё/е, пробелы и пунктуация не важны. */
export function answerKey(text: string): string {
  return tokenize(text).join(" ");
}

interface ForbiddenRule {
  source: string;
  tokens: string[];
  prefix: boolean;
}

function compileRule(entry: string): ForbiddenRule | null {
  const trimmed = entry.trim();
  const prefix = trimmed.endsWith("*");
  const tokens = tokenize(prefix ? trimmed.slice(0, -1) : trimmed);
  if (tokens.length === 0) return null;
  return { source: trimmed, tokens, prefix };
}

function matchesAt(words: string[], start: number, rule: ForbiddenRule): boolean {
  if (start + rule.tokens.length > words.length) return false;
  return rule.tokens.every((token, index) => {
    const word = words[start + index] ?? "";
    const isLast = index === rule.tokens.length - 1;
    return isLast && rule.prefix ? word.startsWith(token) : word === token;
  });
}

/**
 * Возвращает первую сработавшую запись словаря или null.
 * Сравниваются целые слова и последовательности слов; «*» в конце записи — совпадение по началу слова.
 */
export function findForbidden(text: string, dictionary: readonly string[]): string | null {
  const words = tokenize(text);
  for (const entry of dictionary) {
    const rule = compileRule(entry);
    if (!rule) continue;
    for (let start = 0; start < words.length; start += 1) {
      if (matchesAt(words, start, rule)) return rule.source;
    }
  }
  return null;
}

/** Всё, что нельзя писать в объяснении: термин, допустимые ответы, формы и запрещённые фразы. */
export function explanationDictionary(card: { term: string; acceptedAnswers: readonly string[]; forbiddenForms: readonly string[]; forbiddenPhrases: readonly string[] }): string[] {
  return [card.term, ...card.acceptedAnswers, ...card.forbiddenForms, ...card.forbiddenPhrases];
}

/** Служебные слова: запрет на них делает почти любое объяснение невозможным. */
export const FUNCTION_WORDS = new Set([
  "и", "в", "во", "не", "ни", "на", "с", "со", "а", "но", "к", "ко", "у", "о", "об", "от", "до", "за", "из", "по", "для",
  "это", "что", "как", "так", "то", "же", "ли", "бы", "он", "она", "оно", "они", "я", "ты", "мы", "вы", "его", "ее", "их",
]);
