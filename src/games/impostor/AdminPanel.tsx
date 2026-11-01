// Редактор пар тем: CRUD, draft/published, проверка, JSON-импорт и экспорт. Доступ — admin/editor (проверяет сервер).
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Download, Plus, Save, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import type { ContentStatus, Pair, Topic } from "../../../shared/games/impostor/types";
import { findForbidden } from "../../../shared/games/impostor/text";
import { API_BASE } from "./client";
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
  item: Pair;
  review: Review;
}

type Draft = Omit<Pair, "id" | "revision">;

const ADMIN = `${API_BASE}/admin/content`;

const emptyTopic = (): Topic => ({ title: "", description: "", examples: ["", "", ""], forbiddenWords: [""] });
const emptyDraft = (): Draft => ({ title: "", difference: "", a: emptyTopic(), b: emptyTopic() });

function cleanTopic(topic: Topic): Topic {
  return { ...topic, examples: topic.examples.map((e) => e.trim()).filter(Boolean), forbiddenWords: topic.forbiddenWords.map((w) => w.trim()).filter(Boolean) };
}

function ListField({ label, values, onChange, hint }: { label: string; values: string[]; onChange: (values: string[]) => void; hint: string }) {
  return (
    <fieldset className="rr-impostor-list-field">
      <legend>{label}</legend>
      <p className="rr-impostor-muted">{hint}</p>
      {values.map((value, index) => (
        <div key={index} className="rr-impostor-input-row">
          <input aria-label={`${label}, №${index + 1}`} value={value} onChange={(event) => onChange(values.map((v, i) => (i === index ? event.target.value : v)))} />
          <button type="button" className="rr-impostor-icon-btn" aria-label={`Удалить: ${label}, №${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="rr-impostor-link" onClick={() => onChange([...values, ""])}>
        + Добавить
      </button>
    </fieldset>
  );
}

function TopicEditor({ label, topic, onChange }: { label: string; topic: Topic; onChange: (topic: Topic) => void }) {
  const id = label.replace(/\s+/g, "-");
  return (
    <fieldset className="rr-impostor-card rr-impostor-topic-editor">
      <legend>{label}</legend>
      <label htmlFor={`${id}-title`}>Название темы</label>
      <input id={`${id}-title`} value={topic.title} onChange={(event) => onChange({ ...topic, title: event.target.value })} />
      <label htmlFor={`${id}-desc`}>Описание правила</label>
      <textarea id={`${id}-desc`} rows={3} value={topic.description} onChange={(event) => onChange({ ...topic, description: event.target.value })} />
      <ListField label="Примеры каталога" values={topic.examples} hint="Минимум 3. Показываются в финале." onChange={(examples) => onChange({ ...topic, examples })} />
      <ListField
        label="Запретные слова"
        values={topic.forbiddenWords}
        hint="Целые слова; «*» в конце — корень (например, «приставк*»). Ё и Е считаются одинаковыми."
        onChange={(forbiddenWords) => onChange({ ...topic, forbiddenWords })}
      />
    </fieldset>
  );
}

function FilterPreview({ draft }: { draft: Draft }) {
  const [sample, setSample] = useState("");
  const hitA = sample ? findForbidden(sample, draft.a.forbiddenWords.filter(Boolean)) : null;
  const hitB = sample ? findForbidden(sample, draft.b.forbiddenWords.filter(Boolean)) : null;
  return (
    <div className="rr-impostor-card">
      <label htmlFor="rr-impostor-filter-sample">Проверить пример игрока</label>
      <input id="rr-impostor-filter-sample" value={sample} onChange={(event) => setSample(event.target.value)} placeholder="Например: подъезд" />
      {sample ? (
        <ul className="rr-impostor-muted" aria-live="polite">
          <li>Тема A: {hitA ? `отклонится («${hitA}»)` : "пройдёт"}</li>
          <li>Тема B: {hitB ? `отклонится («${hitB}»)` : "пройдёт"}</li>
        </ul>
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
    setDraft(row ? { title: row.item.title, difference: row.item.difference, a: row.item.a, b: row.item.b } : emptyDraft());
  };

  const payload = (): Draft => ({ ...draft, a: cleanTopic(draft.a), b: cleanTopic(draft.b) });

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
      if (!selected || !window.confirm(`Удалить пару «${selected.item.title}»? Текущие партии не пострадают.`)) return;
      await api(`${ADMIN}/${selected.id}?expectedRevision=${selected.revision}`, { method: "DELETE" });
      select(null);
    }, "Удалено");

  const exportJson = () =>
    guard(async () => {
      const data = await api(`${ADMIN}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "impostor-pairs.json";
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
      <section className="rr-game-impostor rr-impostor-admin">
        <p role="alert">Редактор доступен только ролям admin и editor.</p>
      </section>
    );
  }

  return (
    <section className="rr-game-impostor rr-impostor-admin" aria-labelledby="rr-impostor-admin-title">
      <header className="rr-impostor-top">
        <h2 id="rr-impostor-admin-title">Самозванец · пары тем</h2>
        <div className="rr-impostor-top-actions">
          <button type="button" className="rr-impostor-btn" onClick={() => select(null)}>
            <Plus aria-hidden="true" /> Новая пара
          </button>
          <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={() => void exportJson()}>
            <Download aria-hidden="true" /> Экспорт JSON
          </button>
        </div>
      </header>
      {message ? (
        <p className="rr-impostor-success" role="status">
          {message}
        </p>
      ) : null}
      <ErrorNote message={error} onClose={() => setError(null)} />
      <div className="rr-impostor-admin-grid">
        <nav className="rr-impostor-card" aria-label="Список пар">
          <p className="rr-impostor-muted">
            Опубликовано {rows.filter((r) => r.status === "published").length} из {rows.length}
          </p>
          <ul className="rr-impostor-admin-list">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" className={`rr-impostor-admin-item${selected?.id === row.id ? " is-selected" : ""}`} onClick={() => select(row)} aria-current={selected?.id === row.id}>
                  <span>{row.item.title}</span>
                  <span className={`rr-impostor-tag${row.status === "published" ? "" : " rr-impostor-tag--muted"}`}>{row.status === "published" ? "опубликовано" : "черновик"}</span>
                  {row.review.errors.length > 0 ? <span className="rr-impostor-tag rr-impostor-tag--bad">ошибок: {row.review.errors.length}</span> : null}
                  {row.review.warnings.length > 0 ? <span className="rr-impostor-tag rr-impostor-tag--warn">замечаний: {row.review.warnings.length}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="rr-impostor-stack">
          <div className="rr-impostor-card">
            <h3>{selected ? `Редактирование · ревизия ${selected.revision}` : "Новая пара (черновик)"}</h3>
            <label htmlFor="rr-impostor-pair-title">Название пары</label>
            <input id="rr-impostor-pair-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            <label htmlFor="rr-impostor-pair-diff">Объяснение различия (показывается в финале)</label>
            <textarea id="rr-impostor-pair-diff" rows={3} value={draft.difference} onChange={(event) => setDraft({ ...draft, difference: event.target.value })} />
          </div>
          <div className="rr-impostor-topics">
            <TopicEditor label="Тема A" topic={draft.a} onChange={(a) => setDraft({ ...draft, a })} />
            <TopicEditor label="Тема B" topic={draft.b} onChange={(b) => setDraft({ ...draft, b })} />
          </div>
          <FilterPreview draft={draft} />
          {review ? (
            <div className="rr-impostor-card" aria-live="polite">
              <h3>Проверка</h3>
              {review.errors.length === 0 && review.warnings.length === 0 ? <p>Ошибок нет.</p> : null}
              <ul>
                {review.errors.map((text) => (
                  <li key={text} className="rr-impostor-bad">
                    Ошибка: {text}
                  </li>
                ))}
                {review.warnings.map((text) => (
                  <li key={text}>Замечание: {text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rr-impostor-card rr-impostor-controls">
            <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={() => void check()}>
              <ShieldCheck aria-hidden="true" /> Проверить
            </button>
            <button type="button" className="rr-impostor-btn" onClick={() => void save()}>
              <Save aria-hidden="true" /> Сохранить
            </button>
            {selected ? (
              selected.status === "published" ? (
                <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={() => void setStatus("draft")}>
                  Снять с публикации
                </button>
              ) : (
                <button type="button" className="rr-impostor-btn rr-impostor-btn--accent" onClick={() => void setStatus("published")}>
                  Опубликовать
                </button>
              )
            ) : null}
            {selected ? (
              <button type="button" className="rr-impostor-btn rr-impostor-btn--danger" onClick={() => void remove()}>
                <Trash2 aria-hidden="true" /> Удалить
              </button>
            ) : null}
          </div>
          <div className="rr-impostor-card">
            <h3>Импорт JSON</h3>
            <p className="rr-impostor-muted">Формат: {"{ items: [{ status, item }] }"} или список пар. Записи с тем же id обновляются; записи с ошибками сохраняются черновиками.</p>
            <input type="file" accept="application/json,.json" aria-label="Файл JSON для импорта" onChange={readFile} />
            <textarea aria-label="JSON для импорта" rows={4} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <button type="button" className="rr-impostor-btn" disabled={!importText.trim()} onClick={() => void importJson()}>
              <Upload aria-hidden="true" /> Импортировать
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
