import { useState, useEffect } from "react";
import { z } from "zod";
import { ContentSchema } from "../../../shared/games/durak/types";
import type { Content } from "../../../shared/games/durak/types";
import type { API } from "./client";
import "./styles.css";
interface Props {
  api: API;
  roles: string[];
}
const fresh = (): Content => ({
  id: crypto.randomUUID(),
  ruleId: "",
  prompt: "",
  options: ["", ""],
  acceptedAnswers: [0],
  explanation: "",
  difficulty: 1,
  revision: 1,
  status: "draft",
});
export function AdminPanel({ api, roles }: Props) {
  const [items, setItems] = useState<Content[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Content>(fresh),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed = roles.some((r) => ["admin", "editor"].includes(r));
  async function load() {
    const r = z
      .object({ items: z.array(ContentSchema) })
      .parse(await api("/api/games/durak/admin/content"));
    setItems(r.items);
  }
  useEffect(() => {
    if (allowed)
      void load().catch((e) =>
        setError(e instanceof Error ? e.message : "Ошибка загрузки"),
      );
  }, [allowed]);
  if (!allowed)
    return (
      <div className="rr-game-durak">
        <p role="alert">
          Редактор доступен только администраторам и редакторам.
        </p>
      </div>
    );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await fn();
      await load();
      setNote("Изменения сохранены");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка операции");
    } finally {
      setBusy(false);
    }
  }
  const write = async (
    path: string,
    method: string,
    data: Record<string, unknown>,
  ) =>
    api(`/api/games/durak/admin/content${path}`, {
      method,
      body: JSON.stringify({ ...data, commandId: crypto.randomUUID() }),
    });
  return (
    <div className="rr-game-durak">
      <section className="rr-durak-shell rr-durak-admin">
        <small>РЕДАКТОР УЧЕБНОГО КАТАЛОГА</small>
        <h1>Сортировочное бюро</h1>
        <p>
          Ответы доступны только редакторам. Текущие партии используют
          сохранённый снимок заданий.
        </p>
        {error && (
          <p role="alert" className="rr-durak-alert">
            {error}
          </p>
        )}
        {note && <p role="status">{note}</p>}
        <div className="rr-durak-controls">
          <button
            onClick={() => {
              setDraft(fresh());
              setSelected(null);
            }}
          >
            Новое задание
          </button>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(items, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "durak-content.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Экспорт JSON
          </button>
          <label className="rr-durak-import">
            Импорт JSON
            <input
              aria-label="Импорт JSON"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    if (file.size > 800000)
                      throw new Error("Файл больше 800 КБ");
                    const records = z
                      .array(ContentSchema)
                      .min(1)
                      .max(500)
                      .parse(JSON.parse(await file.text()));
                    await write("/import", "POST", {
                      items: records,
                      expectedVersion: 0,
                    });
                  });
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="rr-durak-admin-grid">
          <nav aria-label="Список заданий">
            {items.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  setDraft(structuredClone(c));
                }}
              >
                {c.prompt}
                <small>
                  {c.status === "published" ? "Опубликовано" : "Черновик"} · v
                  {c.revision}
                </small>
              </button>
            ))}
          </nav>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const content = ContentSchema.parse(draft);
                await write(
                  selected ? `/${encodeURIComponent(selected)}` : "",
                  selected ? "PUT" : "POST",
                  { content, expectedVersion: selected ? draft.revision : 0 },
                );
                setSelected(null);
                setDraft(fresh());
              });
            }}
          >
            <label>
              Идентификатор
              <input
                value={draft.id}
                readOnly={!!selected}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
            </label>
            <label>
              Идентификатор правила
              <input
                required
                value={draft.ruleId}
                onChange={(e) => setDraft({ ...draft, ruleId: e.target.value })}
              />
            </label>
            <label>
              Текст задания
              <textarea
                required
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Варианты и правильные ответы</legend>
              {draft.options.map((o, i) => (
                <div className="rr-durak-option-edit" key={i}>
                  <input
                    aria-label={`Вариант ${i + 1} верный`}
                    type="checkbox"
                    checked={draft.acceptedAnswers.includes(i)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        acceptedAnswers: draft.acceptedAnswers.includes(i)
                          ? draft.acceptedAnswers.filter((n) => n !== i)
                          : [...draft.acceptedAnswers, i],
                      })
                    }
                  />
                  <input
                    aria-label={`Вариант ${i + 1}`}
                    required
                    value={o}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        options: draft.options.map((v, j) =>
                          j === i ? e.target.value : v,
                        ),
                      })
                    }
                  />
                  {draft.options.length > 2 && (
                    <button
                      type="button"
                      aria-label={`Удалить вариант ${i + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          options: draft.options.filter((_, j) => j !== i),
                          acceptedAnswers: draft.acceptedAnswers
                            .filter((j) => j !== i)
                            .map((j) => (j > i ? j - 1 : j)),
                        })
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={draft.options.length >= 8}
                onClick={() =>
                  setDraft({ ...draft, options: [...draft.options, ""] })
                }
              >
                Добавить вариант
              </button>
            </fieldset>
            <label>
              Объяснение
              <textarea
                required
                value={draft.explanation}
                onChange={(e) =>
                  setDraft({ ...draft, explanation: e.target.value })
                }
              />
            </label>
            <label>
              Сложность
              <select
                value={draft.difficulty}
                onChange={(e) =>
                  setDraft({ ...draft, difficulty: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Статус
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status:
                      e.target.value === "published" ? "published" : "draft",
                  })
                }
              >
                <option value="draft">Черновик</option>
                <option value="published">Опубликовано</option>
              </select>
            </label>
            <div className="rr-durak-controls">
              <button className="rr-durak-primary" disabled={busy}>
                Сохранить
              </button>
              {selected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await write(
                        `/${encodeURIComponent(selected)}`,
                        "DELETE",
                        { expectedVersion: draft.revision },
                      );
                      setSelected(null);
                      setDraft(fresh());
                    })
                  }
                >
                  Удалить задание
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
