// Редактор терминов: CRUD, draft/published, проверка, JSON-импорт и экспорт. Доступ — admin/editor (проверяет сервер).
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Download, Plus, Save, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import type { ContentStatus, Difficulty, Term } from "../../../shared/games/whoami/types";
import { matchesAnswer } from "../../../shared/games/whoami/text";
import { API_BASE } from "./client";
import { SAMPLE_QUESTIONS } from "./Game";
import { ErrorNote } from "./ui";

export type AdminApi = (path: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;

export interface AdminPanelProps {
  api: AdminApi;
  permissions: { canEdit: boolean };
}

interface Review {
  errors: string[];
  warnings: string[];
}

interface AdminRow {
  id: string;
  status: ContentStatus;
  revision: number;
  updatedAt: number;
  updatedBy: string;
  item: Term;
  review: Review;
}

type Draft = Omit<Term, "id" | "revision">;

const ADMIN = `${API_BASE}/admin/content`;

const emptyDraft = (): Draft => ({ term: "", definition: "", acceptedAnswers: [], difficulty: 1, category: "", equivalenceYo: false });

function AnswersField({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const [next, setNext] = useState("");
  const add = () => {
    if (!next.trim()) return;
    onChange([...values, next.trim()]);
    setNext("");
  };
  return (
    <fieldset className="rr-whoami-list-field">
      <legend>Допустимые варианты ответа</legend>
      <p className="rr-whoami-muted">По одному. Сам термин засчитывается всегда. Регистр, пробелы и NFKC нормализуются; ё/е — только с флажком ниже.</p>
      <ul>
        {values.map((value, index) => (
          <li key={`${value}-${index}`} className="rr-whoami-input-row">
            <input aria-label={`Вариант ответа №${index + 1}`} value={value} onChange={(event) => onChange(values.map((v, i) => (i === index ? event.target.value : v)))} />
            <button type="button" className="rr-whoami-icon-btn" aria-label={`Удалить вариант №${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="rr-whoami-input-row">
        <input
          aria-label="Новый вариант ответа"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={add}>
          + Добавить вариант
        </button>
      </div>
    </fieldset>
  );
}

function AnswerPreview({ draft }: { draft: Draft }) {
  const [sample, setSample] = useState("");
  const accepted = sample ? matchesAnswer(sample, [draft.term, ...draft.acceptedAnswers].filter(Boolean), draft.equivalenceYo) : null;
  return (
    <div className="rr-whoami-card">
      <label htmlFor="rr-whoami-answer-sample">Проверить ответ игрока</label>
      <input id="rr-whoami-answer-sample" value={sample} onChange={(event) => setSample(event.target.value)} placeholder="Например: ответ игрока" />
      {accepted !== null ? (
        <p aria-live="polite" className={accepted ? "rr-whoami-success" : "rr-whoami-bad"}>
          {accepted ? "Ответ будет засчитан" : "Ответ не засчитается"}
        </p>
      ) : null}
    </div>
  );
}

export function AdminPanel({ api, permissions }: AdminPanelProps) {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [selected, setSelected] = useState<AdminRow | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [review, setReview] = useState<Review | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");

  const load = useCallback(async () => {
    try {
      const data = (await api(ADMIN)) as { items: AdminRow[] };
      setRows(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить контент");
    }
  }, [api]);

  useEffect(() => void load(), [load]);

  const guard = async (operation: () => Promise<void>, done?: string) => {
    setError(null);
    setMessage(null);
    try {
      await operation();
      if (done) setMessage(done);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Операция не выполнена");
    }
  };

  const select = (row: AdminRow | null) => {
    setSelected(row);
    setReview(row?.review ?? null);
    setDraft(row ? { term: row.item.term, definition: row.item.definition, acceptedAnswers: row.item.acceptedAnswers, difficulty: row.item.difficulty, category: row.item.category, equivalenceYo: row.item.equivalenceYo } : emptyDraft());
  };

  const payload = (): Draft => ({ ...draft, acceptedAnswers: draft.acceptedAnswers.map((a) => a.trim()).filter(Boolean) });

  const save = () =>
    guard(async () => {
      const saved = (selected
        ? await api(`${ADMIN}/${selected.id}`, { method: "PUT", body: { item: payload(), expectedRevision: selected.revision } })
        : await api(ADMIN, { method: "POST", body: { item: payload() } })) as AdminRow;
      select(saved);
    }, "Сохранено");

  const check = () =>
    guard(async () => {
      const result = (await api(`${ADMIN}/check`, { method: "POST", body: { item: payload() } })) as { review: Review };
      setReview(result.review);
    });

  const setStatus = (status: ContentStatus) =>
    guard(async () => {
      if (!selected) return;
      select((await api(`${ADMIN}/${selected.id}/status`, { method: "POST", body: { status, expectedRevision: selected.revision } })) as AdminRow);
    }, status === "published" ? "Опубликовано" : "Снято с публикации");

  const remove = () =>
    guard(async () => {
      if (!selected || !window.confirm(`Удалить термин «${selected.item.term}»? Текущие партии не пострадают.`)) return;
      await api(`${ADMIN}/${selected.id}?expectedRevision=${selected.revision}`, { method: "DELETE" });
      select(null);
    }, "Удалено");

  const exportJson = () =>
    guard(async () => {
      const data = await api(`${ADMIN}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "whoami-terms.json";
      link.click();
      URL.revokeObjectURL(url);
    });

  const importJson = () =>
    guard(async () => {
      const parsed: unknown = JSON.parse(importText);
      const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
      const report = (await api(`${ADMIN}/import`, { method: "POST", body: { items } })) as { created: number; updated: number; published: number; rejected: unknown[]; drafts: unknown[] };
      setMessage(`Импорт: новых ${report.created}, обновлено ${report.updated}, опубликовано ${report.published}, черновиков из-за ошибок ${report.drafts.length}, отклонено ${report.rejected.length}`);
      setImportText("");
    });

  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void file.text().then(setImportText);
  };

  if (!permissions.canEdit) {
    return (
      <section className="rr-game-whoami rr-whoami-admin">
        <p role="alert">Редактор доступен только ролям admin и editor.</p>
      </section>
    );
  }

  return (
    <section className="rr-game-whoami rr-whoami-admin" aria-labelledby="rr-whoami-admin-title">
      <header className="rr-whoami-top">
        <h2 id="rr-whoami-admin-title">Кто я · термины</h2>
        <div className="rr-whoami-top-actions">
          <button type="button" className="rr-whoami-btn" onClick={() => select(null)}>
            <Plus aria-hidden="true" /> Новый термин
          </button>
          <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={() => void exportJson()}>
            <Download aria-hidden="true" /> Экспорт JSON
          </button>
        </div>
      </header>
      {message ? (
        <p className="rr-whoami-success" role="status">
          {message}
        </p>
      ) : null}
      <ErrorNote message={error} onClose={() => setError(null)} />
      <div className="rr-whoami-admin-grid">
        <nav className="rr-whoami-card" aria-label="Список терминов">
          <p className="rr-whoami-muted">
            Опубликовано {rows.filter((r) => r.status === "published").length} из {rows.length}
          </p>
          <ul className="rr-whoami-admin-list">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" className={`rr-whoami-admin-item${selected?.id === row.id ? " is-selected" : ""}`} onClick={() => select(row)} aria-current={selected?.id === row.id}>
                  <span>{row.item.term}</span>
                  <span className={`rr-whoami-tag${row.status === "published" ? "" : " rr-whoami-tag--muted"}`}>{row.status === "published" ? "опубликовано" : "черновик"}</span>
                  {row.review.errors.length > 0 ? <span className="rr-whoami-tag rr-whoami-tag--bad">ошибок: {row.review.errors.length}</span> : null}
                  {row.review.warnings.length > 0 ? <span className="rr-whoami-tag rr-whoami-tag--warn">замечаний: {row.review.warnings.length}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="rr-whoami-stack">
          <div className="rr-whoami-card">
            <h3>{selected ? `Редактирование · ревизия ${selected.revision}` : "Новый термин (черновик)"}</h3>
            <label htmlFor="rr-whoami-term">Термин</label>
            <input id="rr-whoami-term" value={draft.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} />
            <label htmlFor="rr-whoami-definition">Определение (показывается после угадывания и в финале)</label>
            <textarea id="rr-whoami-definition" rows={3} value={draft.definition} onChange={(event) => setDraft({ ...draft, definition: event.target.value })} />
            {draft.definition.trim() === "" ? <p className="rr-whoami-bad">Определение пустое — такой термин нельзя опубликовать.</p> : null}
            <div className="rr-whoami-input-row">
              <label className="rr-whoami-select">
                Категория
                <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              </label>
              <label className="rr-whoami-select">
                Сложность
                <select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: Number(event.target.value) as Difficulty })}>
                  <option value={1}>1 — простой</option>
                  <option value={2}>2 — средний</option>
                  <option value={3}>3 — сложный</option>
                </select>
              </label>
            </div>
            <label className="rr-whoami-switch">
              <input type="checkbox" checked={draft.equivalenceYo} onChange={(event) => setDraft({ ...draft, equivalenceYo: event.target.checked })} /> Считать ё и е одной буквой
            </label>
            <AnswersField values={draft.acceptedAnswers} onChange={(acceptedAnswers) => setDraft({ ...draft, acceptedAnswers })} />
          </div>
          <AnswerPreview draft={draft} />
          {review ? (
            <div className="rr-whoami-card" aria-live="polite">
              <h3>Проверка</h3>
              {review.errors.length === 0 && review.warnings.length === 0 ? <p>Ошибок нет.</p> : null}
              <ul>
                {review.errors.map((text) => (
                  <li key={text} className="rr-whoami-bad">
                    Ошибка: {text}
                  </li>
                ))}
                {review.warnings.map((text) => (
                  <li key={text}>Предупреждение: {text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rr-whoami-card rr-whoami-controls">
            <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={() => void check()}>
              <ShieldCheck aria-hidden="true" /> Проверить
            </button>
            <button type="button" className="rr-whoami-btn" onClick={() => void save()}>
              <Save aria-hidden="true" /> Сохранить
            </button>
            {selected ? (
              selected.status === "published" ? (
                <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={() => void setStatus("draft")}>
                  Снять с публикации
                </button>
              ) : (
                <button type="button" className="rr-whoami-btn rr-whoami-btn--accent" onClick={() => void setStatus("published")}>
                  Опубликовать
                </button>
              )
            ) : null}
            {selected ? (
              <button type="button" className="rr-whoami-btn rr-whoami-btn--danger" onClick={() => void remove()}>
                <Trash2 aria-hidden="true" /> Удалить
              </button>
            ) : null}
          </div>
          <div className="rr-whoami-card">
            <h3>Примеры корректных вопросов для игроков</h3>
            <p className="rr-whoami-muted">Вопрос должен допускать ответ «да», «нет» или «неоднозначно» и не называть сам термин.</p>
            <ul className="rr-whoami-samples">
              {SAMPLE_QUESTIONS.map((sample) => (
                <li key={sample} className="rr-whoami-chip">
                  {sample}
                </li>
              ))}
            </ul>
          </div>
          <div className="rr-whoami-card">
            <h3>Импорт JSON</h3>
            <p className="rr-whoami-muted">Формат: {"{ items: [{ status, item }] }"} или список терминов. Записи с тем же id обновляются; записи с ошибками сохраняются черновиками.</p>
            <input type="file" accept="application/json,.json" aria-label="Файл JSON для импорта" onChange={readFile} />
            <textarea aria-label="JSON для импорта" rows={4} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <button type="button" className="rr-whoami-btn" disabled={!importText.trim()} onClick={() => void importJson()}>
              <Upload aria-hidden="true" /> Импортировать
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
