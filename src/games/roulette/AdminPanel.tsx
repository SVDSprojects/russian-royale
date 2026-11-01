import { useEffect, useState } from "react";
import {
  ContentSchema,
  contentIssues,
  type Content,
  type Question,
} from "../../../shared/games/roulette/types";
import type { Api } from "./client";
import "./styles.css";
const base = "/api/games/roulette/admin/content";
export type AdminProps = { api: Api; role: string };
function blank(): Content {
  return {
    id: "set_" + crypto.randomUUID(),
    title: "Новый учебный набор",
    status: "draft",
    revision: 1,
    categories: [
      { id: "c1", label: "Категория 1", color: "#E6FF60" },
      { id: "c2", label: "Категория 2", color: "#FF8065" },
      { id: "c3", label: "Категория 3", color: "#92BBFF" },
    ],
    questions: [],
  };
}
export function AdminPanel({ api, role }: AdminProps) {
  const [items, setItems] = useState<Content[]>([]),
    [draft, setDraft] = useState<Content | null>(null),
    [original, setOriginal] = useState(0),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [json, setJson] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed = role === "admin" || role === "editor";
  async function load() {
    const data = await api(base);
    if (typeof data === "object" && data !== null && "content" in data)
      setItems(ContentSchema.array().parse(data.content));
  }
  useEffect(() => {
    if (allowed)
      void load().catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки"),
      );
  }, [allowed]);
  async function operation(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Некорректные данные");
    } finally {
      setBusy(false);
    }
  }
  function editQuestion(patch: Partial<Question>) {
    if (!draft) return;
    setDraft({
      ...draft,
      questions: draft.questions.map((q, i) =>
        i === selected ? { ...q, ...patch } : q,
      ),
    });
  }
  function addQuestion() {
    if (!draft) return;
    const q: Question = {
      id: "q_" + crypto.randomUUID(),
      categoryId: draft.categories[0]!.id,
      cost: 100,
      prompt: "Новый вопрос",
      options: [],
      acceptedAnswers: ["ответ"],
      explanation: "Объяснение ответа",
      ruleId: "rule",
      ruleIds: ["rule"],
      ruleUrl: "#rules/rule",
      difficulty: 1,
      status: "draft",
      revision: 1,
      normalization: {
        trim: false,
        caseFold: false,
        collapseSpaces: false,
        foldYo: false,
        stripPunctuation: false,
      },
    };
    setSelected(draft.questions.length);
    setDraft({ ...draft, questions: [...draft.questions, q] });
  }
  const q = draft?.questions[selected];
  if (!allowed)
    return (
      <section className="rr-game-roulette">
        <p role="alert">Редактор доступен только администратору и редактору.</p>
      </section>
    );
  return (
    <section className="rr-game-roulette">
      <p className="rr-kicker">МАСТЕРСКАЯ МАТЕРИАЛОВ</p>
      <h1>Редактор заданий</h1>
      <p>
        Ответы доступны только редакторам. Опубликованный набор копируется в
        партию при старте.
      </p>
      {error && (
        <div className="rr-error" role="alert">
          {error}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <div className="rr-actions">
        <button
          onClick={() => {
            setDraft(blank());
            setOriginal(0);
            setSelected(0);
          }}
        >
          Новый набор
        </button>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(items, null, 2)], {
                type: "application/json",
              }),
              url = URL.createObjectURL(blob),
              a = document.createElement("a");
            a.href = url;
            a.download = "roulette-content.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Экспорт JSON
        </button>
      </div>
      <div className="rr-admin-list">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setDraft(structuredClone(c));
              setOriginal(c.revision);
              setSelected(0);
            }}
          >
            {c.title} · {c.status === "published" ? "Опубликован" : "Черновик"}{" "}
            · v{c.revision}
          </button>
        ))}
      </div>
      {draft && (
        <div className="rr-admin-editor">
          <label>
            Название набора
            <input
              value={draft.title}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Идентификатор
            <input
              value={draft.id}
              disabled={original > 0}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            />
          </label>
          <label>
            Публикация
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as Content["status"],
                })
              }
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликован</option>
            </select>
          </label>
          <h2>Категории и цвета</h2>
          {draft.categories.map((c, i) => (
            <div className="rr-category-edit" key={c.id}>
              <label>
                Идентификатор
                <input
                  value={c.id}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, id: e.target.value } : x,
                      ),
                      questions: draft.questions.map((q) =>
                        q.categoryId === c.id
                          ? { ...q, categoryId: e.target.value }
                          : q,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Подпись
                <input
                  value={c.label}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Цвет
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, color: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                disabled={
                  draft.categories.length <= 1 ||
                  draft.questions.some((q) => q.categoryId === c.id)
                }
                onClick={() =>
                  setDraft({
                    ...draft,
                    categories: draft.categories.filter((_, j) => j !== i),
                  })
                }
              >
                Удалить категорию
              </button>
            </div>
          ))}
          <button
            disabled={draft.categories.length >= 12}
            onClick={() =>
              setDraft({
                ...draft,
                categories: [
                  ...draft.categories,
                  {
                    id: "c_" + crypto.randomUUID(),
                    label: "Новая категория",
                    color: "#65DDCE",
                  },
                ],
              })
            }
          >
            Добавить категорию
          </button>
          <h2>Карточки · {draft.questions.length}</h2>
          <div className="rr-actions">
            <label>
              Выберите карточку
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {draft.questions.map((q, i) => (
                  <option value={i} key={q.id}>
                    {i + 1}. {q.prompt.slice(0, 70)}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={addQuestion}>Добавить вопрос</button>
          </div>
          {q && (
            <div className="rr-question-editor">
              <label>
                Вопрос
                <textarea
                  value={q.prompt}
                  maxLength={3000}
                  onChange={(e) => editQuestion({ prompt: e.target.value })}
                />
              </label>
              <div className="rr-fields">
                <label>
                  Категория
                  <select
                    value={q.categoryId}
                    onChange={(e) =>
                      editQuestion({ categoryId: e.target.value })
                    }
                  >
                    {draft.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Стоимость
                  <select
                    value={q.cost}
                    onChange={(e) =>
                      editQuestion({
                        cost: Number(e.target.value) as Question["cost"],
                      })
                    }
                  >
                    {[100, 200, 300, 400, 500].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Сложность
                  <select
                    value={q.difficulty}
                    onChange={(e) =>
                      editQuestion({
                        difficulty: Number(
                          e.target.value,
                        ) as Question["difficulty"],
                      })
                    }
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус
                  <select
                    value={q.status}
                    onChange={(e) =>
                      editQuestion({
                        status: e.target.value as Question["status"],
                      })
                    }
                  >
                    <option value="draft">Черновик</option>
                    <option value="published">Опубликован</option>
                  </select>
                </label>
              </div>
              <label>
                Варианты, каждый с новой строки (пусто — текстовый ответ)
                <textarea
                  value={q.options.join("\n")}
                  onChange={(e) =>
                    editQuestion({
                      options: e.target.value ? e.target.value.split("\n") : [],
                    })
                  }
                />
              </label>
              <label>
                Принимаемые ответы, каждый с новой строки
                <textarea
                  value={q.acceptedAnswers.join("\n")}
                  onChange={(e) =>
                    editQuestion({
                      acceptedAnswers: e.target.value.split("\n"),
                    })
                  }
                />
              </label>
              <label>
                Объяснение
                <textarea
                  value={q.explanation}
                  onChange={(e) =>
                    editQuestion({ explanation: e.target.value })
                  }
                />
              </label>
              <div className="rr-fields">
                <label>
                  Код правила
                  <input
                    value={q.ruleId}
                    onChange={(e) =>
                      editQuestion({
                        ruleId: e.target.value,
                        ruleIds: [e.target.value],
                      })
                    }
                  />
                </label>
                <label>
                  Ссылка на правило
                  <input
                    value={q.ruleUrl}
                    onChange={(e) => editQuestion({ ruleUrl: e.target.value })}
                  />
                </label>
              </div>
              <fieldset>
                <legend>Нормализация только для этой карточки</legend>
                {(
                  [
                    ["trim", "Убрать пробелы по краям"],
                    ["caseFold", "Не учитывать регистр"],
                    ["collapseSpaces", "Объединить повторные пробелы"],
                    ["foldYo", "Приравнять ё к е"],
                    ["stripPunctuation", "Убрать пунктуацию"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="rr-check" key={key}>
                    <input
                      type="checkbox"
                      checked={q.normalization[key]}
                      onChange={(e) =>
                        editQuestion({
                          normalization: {
                            ...q.normalization,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <button
                onClick={() => {
                  setDraft({
                    ...draft,
                    questions: draft.questions.filter((_, i) => i !== selected),
                  });
                  setSelected(0);
                }}
              >
                Удалить карточку
              </button>
            </div>
          )}
          <div className="rr-error" role="status">
            {contentIssues(draft).length
              ? contentIssues(draft).map((x, i) => <p key={i}>{x}</p>)
              : "Набор заполнен и может быть опубликован."}
          </div>
          <div className="rr-actions">
            <button
              disabled={busy}
              onClick={() =>
                void operation(async () => {
                  const content = ContentSchema.parse({
                    ...draft,
                    revision: original + 1,
                  });
                  await api(
                    base + (original ? "/" + encodeURIComponent(draft.id) : ""),
                    {
                      method: original ? "PUT" : "POST",
                      body: JSON.stringify({
                        content,
                        commandId: crypto.randomUUID(),
                        expectedVersion: original,
                      }),
                    },
                  );
                  setDraft(content);
                  setOriginal(content.revision);
                  setMessage("Набор сохранён");
                })
              }
            >
              Сохранить набор
            </button>
            {original > 0 && (
              <button
                disabled={busy}
                onClick={() =>
                  void operation(async () => {
                    await api(base + "/" + encodeURIComponent(draft.id), {
                      method: "DELETE",
                      body: JSON.stringify({
                        commandId: crypto.randomUUID(),
                        expectedVersion: original,
                      }),
                    });
                    setDraft(null);
                    setOriginal(0);
                    setMessage(
                      "Набор удалён. Текущие партии продолжаются со своей копией.",
                    );
                  })
                }
              >
                Удалить набор
              </button>
            )}
          </div>
        </div>
      )}
      <details className="rr-import">
        <summary>Импорт новых наборов JSON</summary>
        <p>
          Массив наборов с revision: 1. Существующие материалы не заменяются.
        </p>
        <label>
          JSON
          <textarea
            rows={8}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !json}
          onClick={() =>
            void operation(async () => {
              const content = ContentSchema.array().parse(JSON.parse(json));
              await api(base + "/import", {
                method: "POST",
                body: JSON.stringify({
                  content,
                  commandId: crypto.randomUUID(),
                  expectedVersion: 0,
                }),
              });
              setJson("");
              setMessage("Наборы импортированы");
            })
          }
        >
          Импортировать
        </button>
      </details>
    </section>
  );
}
