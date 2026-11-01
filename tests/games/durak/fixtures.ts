import type { Content } from "../../../shared/games/durak/types";
// Только авторские демонстрационные записи; не входят в production-бандл.
export const demoContent: Content[] = [
  {
    id: "demo-zhi-shi",
    ruleId: "demo-spelling",
    prompt: "В каком слове правильно написано сочетание ЖИ?",
    options: ["жизнь", "жызнь"],
    acceptedAnswers: [0],
    explanation: "Сочетания жи и ши пишутся с буквой и: жизнь, шина.",
    difficulty: 1,
    revision: 1,
    status: "published",
  },
  {
    id: "demo-verb",
    ruleId: "demo-spelling",
    prompt: "Выберите глагол в неопределённой форме.",
    options: ["учиться", "учится"],
    acceptedAnswers: [0],
    explanation:
      "Учиться отвечает на вопрос «что делать?». В неопределённой форме перед -ся сохраняется мягкий знак.",
    difficulty: 2,
    revision: 1,
    status: "published",
  },
  {
    id: "demo-yo",
    ruleId: "demo-spelling",
    prompt: "Выберите название дерева с буквой ё. В этой карточке требуется точная буква.",
    options: ["ёлка", "елка"],
    acceptedAnswers: [0],
    explanation:
      "В этой демонстрационной карточке требуется точное написание с ё: ёлка. Автоматическая замена ё на е не выполняется.",
    difficulty: 1,
    revision: 1,
    status: "published",
  },
];
