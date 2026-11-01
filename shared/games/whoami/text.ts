// Сравнение ответа с термином. Только trim, Unicode NFKC, регистр и повторные пробелы;
// ё/е — лишь если карточка разрешает (equivalenceYo). Неточного сравнения и внешнего ИИ нет.

export function normalizeAnswer(text: string, equivalenceYo: boolean): string {
  const base = text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
  return equivalenceYo ? base.replace(/ё/g, "е") : base;
}

export function matchesAnswer(guess: string, accepted: readonly string[], equivalenceYo: boolean): boolean {
  const wanted = normalizeAnswer(guess, equivalenceYo);
  if (wanted.length === 0) return false;
  return accepted.some((answer) => normalizeAnswer(answer, equivalenceYo) === wanted);
}
