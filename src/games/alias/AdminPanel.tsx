// Редактор карточек «Alias»: CRUD, draft/published, проверка, предпросмотр фильтра, JSON-импорт и экспорт.
// Доступ — admin/editor (проверяет сервер).
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Download, Plus, Save, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import type { Card, ContentStatus } from "../../../shared/games/alias/types";
import { explanationDictionary, findForbidden } from "../../../shared/games/alias/text";
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
  item: Card;
  review: Review;
}

type Draft = Omit<Card, "id" | "revision">;

const ADMIN = `${API_BASE}/admin/content`;

const emptyDraft = (): Draft => ({ term: "", acceptedAnswers: [""], forbiddenPhrases: ["", "", ""], forbiddenForms: [""], definition: "", difficulty: 1, category: "" });

const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);

function ListField({ label, values, onChange, hint }: { label: string; values: string[]; onChange: (values: string[]) => void; hint: string }) {
  return (
    <fieldset className="rr-alias-list-field">
      <legend>{label}</legend>
      <p className="rr-alias-muted">{hint}</p>
      {values.map((value, index) => (
        <div key={index} className="rr-alias-input-row">
          <input aria-label={`${label}, №${index + 1}`} value={value} onChange={(event) => onChange(values.map((v, i) => (i === index ? event.target.value : v)))} />
          <button type="button" className="rr-alias-icon-btn" aria-label={`Удалить: ${label}, №${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="rr-alias-link" onClick={() => onChange([...values, ""])}>
        + Добавить
      </button>
    </fieldset>
  );
}

function FilterPreview({ draft }: { draft: Draft }) {
  const [sample, setSample] = useState("");
  const dictionary = explanationDictionary({
    term: draft.term,
    acceptedAnswers: clean(draft.acceptedAnswers),
    forbiddenForms: clean(draft.forbiddenForms),
    forbiddenPhrases: clean(draft.forbiddenPhrases),
  }).filter(Boolean);
  const hit = sample ? findForbidden(sample, dictionary) : null;
  return (
    <div className="rr-alias-card">
      <label htmlFor="rr-alias-filter-sample">Предпросмотр фильтра: объяснение</label>
      <textarea id="rr-alias-filter-sample" rows={2} value={sample} onChange={(event) => setSample(event.target.value)} placeholder="Например: так называют слова, похожие по смыслу" />
      {sample ? (
        <p className="rr-alias-muted" aria-live="polite">
          {hit ? `Отклонится: сработал запрет «${hit}»` : "Пройдёт: запрещённых слов нет"}
        </p>
      ) : null}
      <p className="rr-alias-muted">Сравнение — по целым словам после NFKC, регистра и ё/е. Морфологии нет: формы термина перечисляйте сами или ставьте «*» в конце корня.</p>
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
  const [filter, setFilter] = useState("");

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
    if (!row) {
      setDraft(emptyDraft());
      return;
    }
    const { id: _id, revision: _revision, ...rest } = row.item;
    setDraft({ ...rest, forbiddenForms: rest.forbiddenForms.length > 0 ? rest.forbiddenForms : [""] });
  };

  const payload = (): Draft => ({
    ...draft,
    acceptedAnswers: clean(draft.acceptedAnswers),
    forbiddenPhrases: clean(draft.forbiddenPhrases),
    forbiddenForms: clean(draft.forbiddenForms),
  });

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
      if (!selected || !window.confirm(`Удалить карточку «${selected.item.term}»? Текущие партии не пострадают.`)) return;
      await api(`${ADMIN}/${selected.id}?expectedRevision=${selected.revision}`, { method: "DELETE" });
      select(null);
    }, "Удалено");

  const exportJson = () =>
    guard(async () => {
      const data = await api(`${ADMIN}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "alias-cards.json";
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
      <section className="rr-game-alias rr-alias-admin">
        <p role="alert">Редактор доступен только ролям admin и editor.</p>
      </section>
    );
  }

  const published = rows.filter((r) => r.status === "published").length;
  const visible = rows.filter((row) => !filter || `${row.item.term} ${row.item.category}`.toLocaleLowerCase("ru-RU").includes(filter.toLocaleLowerCase("ru-RU")));

  return (
    <section className="rr-game-alias rr-alias-admin" aria-labelledby="rr-alias-admin-title">
      <header className="rr-alias-top">
        <h2 id="rr-alias-admin-title">Alias · карточки</h2>
        <div className="rr-alias-top-actions">
          <button type="button" className="rr-alias-btn" onClick={() => select(null)}>
            <Plus aria-hidden="true" /> Новая карточка
          </button>
          <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={() => void exportJson()}>
            <Download aria-hidden="true" /> Экспорт JSON
          </button>
        </div>
      </header>
      {message ? (
        <p className="rr-alias-success" role="status">
          {message}
        </p>
      ) : null}
      <ErrorNote message={error} onClose={() => setError(null)} />
      {published < 30 ? <p className="rr-alias-warning-text">Для старта партии нужно минимум 30 опубликованных карточек — сейчас {published}.</p> : null}
      <div className="rr-alias-admin-grid">
        <nav className="rr-alias-card" aria-label="Список карточек">
          <p className="rr-alias-muted">
            Опубликовано {published} из {rows.length}
          </p>
          <label htmlFor="rr-alias-admin-filter">Поиск</label>
          <input id="rr-alias-admin-filter" value={filter} onChange={(event) => setFilter(event.target.value)} />
          <ul className="rr-alias-admin-list">
            {visible.map((row) => (
              <li key={row.id}>
                <button type="button" className={`rr-alias-admin-item${selected?.id === row.id ? " is-selected" : ""}`} onClick={() => select(row)} aria-current={selected?.id === row.id}>
                  <span>{row.item.term}</span>
                  <span className={`rr-alias-tag${row.status === "published" ? "" : " rr-alias-tag--muted"}`}>{row.status === "published" ? "опубликовано" : "черновик"}</span>
                  {row.review.errors.length > 0 ? <span className="rr-alias-tag rr-alias-tag--bad">ошибок: {row.review.errors.length}</span> : null}
                  {row.review.warnings.length > 0 ? <span className="rr-alias-tag rr-alias-tag--warn">замечаний: {row.review.warnings.length}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="rr-alias-stack">
          <div className="rr-alias-card">
            <h3>{selected ? `Редактирование · ревизия ${selected.revision}` : "Новая карточка (черновик)"}</h3>
            <label htmlFor="rr-alias-card-term">Термин</label>
            <input id="rr-alias-card-term" value={draft.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} />
            <label htmlFor="rr-alias-card-category">Категория</label>
            <input id="rr-alias-card-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
            <fieldset className="rr-alias-stepper">
              <legend>Сложность</legend>
              {([1, 2, 3] as const).map((level) => (
                <button key={level} type="button" className={`rr-alias-chip-btn${draft.difficulty === level ? " is-on" : ""}`} aria-pressed={draft.difficulty === level} onClick={() => setDraft({ ...draft, difficulty: level })}>
                  {level}
                </button>
              ))}
            </fieldset>
            <label htmlFor="rr-alias-card-definition">Определение (показывается в финале)</label>
            <textarea id="rr-alias-card-definition" rows={3} value={draft.definition} onChange={(event) => setDraft({ ...draft, definition: event.target.value })} />
          </div>
          <div className="rr-alias-card">
            <ListField label="Допустимые ответы" values={draft.acceptedAnswers} hint="Каждый вариант отдельно. Регистр, ё/е и пунктуация при сравнении не важны." onChange={(acceptedAnswers) => setDraft({ ...draft, acceptedAnswers })} />
            <ListField label="Формы термина" values={draft.forbiddenForms} hint="Запрещённые в объяснении формы и корни: «существительн*», «корня»." onChange={(forbiddenForms) => setDraft({ ...draft, forbiddenForms })} />
            <ListField label="Запрещённые фразы" values={draft.forbiddenPhrases} hint="Минимум 3 разумных запрета. Не запрещайте служебные слова — иначе карточку невозможно объяснить." onChange={(forbiddenPhrases) => setDraft({ ...draft, forbiddenPhrases })} />
          </div>
          <FilterPreview draft={draft} />
          {review ? (
            <div className="rr-alias-card" aria-live="polite">
              <h3>Проверка</h3>
              {review.errors.length === 0 && review.warnings.length === 0 ? <p>Ошибок нет.</p> : null}
              <ul>
                {review.errors.map((text) => (
                  <li key={text} className="rr-alias-bad">
                    Ошибка: {text}
                  </li>
                ))}
                {review.warnings.map((text) => (
                  <li key={text}>Замечание: {text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rr-alias-card rr-alias-controls">
            <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={() => void check()}>
              <ShieldCheck aria-hidden="true" /> Проверить
            </button>
            <button type="button" className="rr-alias-btn" onClick={() => void save()}>
              <Save aria-hidden="true" /> Сохранить
            </button>
            {selected ? (
              selected.status === "published" ? (
                <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={() => void setStatus("draft")}>
                  Снять с публикации
                </button>
              ) : (
                <button type="button" className="rr-alias-btn rr-alias-btn--accent" onClick={() => void setStatus("published")}>
                  Опубликовать
                </button>
              )
            ) : null}
            {selected ? (
              <button type="button" className="rr-alias-btn rr-alias-btn--danger" onClick={() => void remove()}>
                <Trash2 aria-hidden="true" /> Удалить
              </button>
            ) : null}
          </div>
          <div className="rr-alias-card">
            <h3>Импорт JSON</h3>
            <p className="rr-alias-muted">Формат: {"{ items: [{ status, item }] }"} или список карточек. Записи с тем же id обновляются; записи с ошибками сохраняются черновиками.</p>
            <input type="file" accept="application/json,.json" aria-label="Файл JSON для импорта" onChange={readFile} />
            <textarea aria-label="JSON для импорта" rows={4} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <button type="button" className="rr-alias-btn" disabled={!importText.trim()} onClick={() => void importJson()}>
              <Upload aria-hidden="true" /> Импортировать
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
