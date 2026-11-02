import { useEffect, useState } from 'react';
import { BookOpen, Search, Heart, Upload, ArrowLeft } from 'lucide-react';
import { api, useAuth } from '../api';
import { ErrorNotice, Loading, PageHeader, json, message, useResource } from './common';
type Entry = {
  id: string;
  word: string;
  stress: string;
  meaning: string;
  category: string;
  forms: string[];
  examples: string[];
};
type Data = {
  entries: Entry[];
  count: number;
  total: number;
  revision: number;
  source: string;
  version: string;
  categories: string[];
  favorites: string[];
};
export function DictionaryPage() {
  const { user } = useAuth();
  const [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [letter, setLetter] = useState(''),
    [fav, setFav] = useState(false),
    [page, setPage] = useState(0),
    [error, setError] = useState('');
  const [practice, setPractice] = useState<{ id: string; word: string; category: string }[] | null>(null),
    [position, setPosition] = useState(0),
    [revealed, setRevealed] = useState<Entry | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  const data = useResource<Data>(
    `/dictionary?q=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&letter=${encodeURIComponent(letter)}&favorites=${fav}&page=${page}`,
    true,
  );
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (practice)
    return (
      <>
        <PageHeader
          title="Вспомни слово"
          description="Восстанови значение по памяти, затем открой карточку и сравни."
        />
        <button className="rr-button secondary" onClick={() => setPractice(null)}>
          <ArrowLeft size={16} />К словарю
        </button>
        <ErrorNotice text={error} />
        {practice[position] ? (
          <section className="rr-panel sdvs-dictionary-practice">
            <small>
              {position + 1} / {practice.length}
            </small>
            <h2>{practice[position].word}</h2>
            {revealed ? (
              <>
                <p>{revealed.meaning}</p>
                <p>{revealed.examples.join(' · ')}</p>
                <button
                  className="rr-button primary"
                  onClick={() => {
                    setPosition(position + 1);
                    setRevealed(null);
                  }}
                >
                  Следующее слово
                </button>
              </>
            ) : (
              <button
                className="rr-button primary"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    setRevealed(
                      await api(
                        '/dictionary/' + practice[position].id + '/check',
                        json('POST', { recalled: true }),
                      ),
                    ),
                  )
                }
              >
                Открыть значение
              </button>
            )}
          </section>
        ) : (
          <section className="rr-panel">
            <h2>{practice.length ? 'Повторение завершено' : 'Сначала сохрани слова'}</h2>
            <p>
              Тренировка использует до десяти слов из избранного. За самостоятельное открытие значений XP не
              начисляется.
            </p>
          </section>
        )}
      </>
    );
  return (
    <div className="sdvs-dictionary-page">
      <PageHeader
        eyebrow="БИБЛИОТЕКА SDVS"
        title="Академический словарь"
        description="Значение, ударение и употребление — в одной карточке."
        action={
          <button
            className="rr-button secondary"
            disabled={busy || !data.data?.favorites.length}
            onClick={() =>
              void run(async () => {
                setPractice(await api('/dictionary/practice'));
                setPosition(0);
                setRevealed(null);
              })
            }
          >
            Повторить избранное
          </button>
        }
      />
      <ErrorNotice text={error || data.error} />
      <div className="sdvs-dictionary-banner">
        <BookOpen size={44} />
        <div>
          <h2>
            {data.data?.count
              ? `${data.data.count.toLocaleString('ru')} слов в библиотеке`
              : 'Место для большого словаря'}
          </h2>
          <p>
            {data.data?.count
              ? `${data.data.source} · ${data.data.version}`
              : 'Структура готова. Материалы появятся после загрузки и проверки академического словаря.'}
          </p>
        </div>
      </div>
      {!!data.data?.count && (
        <>
          <div className="rr-toolbar">
            <div className="rr-search">
              <Search size={18} />
              <input
                aria-label="Поиск в словаре"
                placeholder="Слово или его часть"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              aria-label="Раздел словаря"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Все разделы</option>
              {data.data?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              className="rr-button secondary"
              aria-pressed={fav}
              onClick={() => {
                setFav(!fav);
                setPage(0);
              }}
            >
              <Heart size={16} />
              {fav ? 'Избранное' : 'Все слова'}
            </button>
          </div>
          <div className="sdvs-alphabet" aria-label="Алфавит">
            <button
              aria-pressed={!letter}
              onClick={() => {
                setLetter('');
                setPage(0);
              }}
            >
              Все
            </button>
            {'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('').map((l) => (
              <button
                key={l}
                aria-pressed={letter === l}
                onClick={() => {
                  setLetter(l);
                  setPage(0);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </>
      )}
      {data.loading ? (
        <Loading />
      ) : !data.data?.entries.length ? (
        <section className="sdvs-empty-collection">
          <BookOpen size={36} />
          <h3>{data.data?.count ? 'Ничего не найдено' : 'Словарь готовится'}</h3>
          <p>
            {data.data?.count
              ? 'Измени запрос или фильтры.'
              : 'Пока можно открыть справочник правил и пройти уроки.'}
          </p>
          <a href="#rules" className="rr-button secondary">
            Открыть правила
          </a>
        </section>
      ) : (
        <div className="sdvs-dictionary-list">
          {data.data.entries.map((e) => (
            <article className="rr-panel sdvs-word" key={e.id}>
              <div>
                <div>
                  <small>{e.category}</small>
                  <h2>{e.stress || e.word}</h2>
                </div>
                <button
                  className="rr-icon-button"
                  aria-label={`${data.data!.favorites.includes(e.id) ? 'Убрать' : 'Сохранить'} ${e.word}`}
                  aria-pressed={data.data!.favorites.includes(e.id)}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        '/dictionary/' + e.id + '/favorite',
                        json('POST', { favorite: !data.data!.favorites.includes(e.id) }),
                      );
                      await data.reload();
                    })
                  }
                >
                  <Heart fill={data.data!.favorites.includes(e.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p>{e.meaning}</p>
              {e.forms.length > 0 && (
                <p>
                  <strong>Формы:</strong> {e.forms.join(', ')}
                </p>
              )}
              {e.examples.length > 0 && (
                <details>
                  <summary>Примеры употребления</summary>
                  {e.examples.map((x, i) => (
                    <p key={i}>{x}</p>
                  ))}
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      {!!data.data?.total && (
        <div className="sdvs-pagination">
          <button className="rr-button secondary" disabled={!page} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span>
            Страница {page + 1} из {Math.ceil(data.data.total / 30)}
          </span>
          <button
            className="rr-button secondary"
            disabled={(page + 1) * 30 >= data.data.total}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </button>
        </div>
      )}
      {(user?.role === 'admin' || user?.role === 'editor') && (
        <DictionaryImport onSaved={() => void data.reload()} />
      )}
    </div>
  );
}
export function DictionaryImport({ onSaved }: { onSaved?: () => void }) {
  const [dictionary, setDictionary] = useState<unknown>(null),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function submit(commit = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<any>(
        '/admin/dictionary/import',
        json('POST', { dictionary, preview: !commit, token: preview?.token }),
      );
      if (commit) {
        setPreview(null);
        setDictionary(null);
        setNotice('Словарь загружен.');
        onSaved?.();
      } else setPreview(result);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rr-panel sdvs-dictionary-import">
      <h2>
        <Upload size={20} /> Загрузка словаря · редакторам
      </h2>
      <p>
        JSON до 3 МБ и 2 000 слов за один импорт. Сначала проверка и предпросмотр, затем сохранение.
        Существующие слова обновляются; остальные остаются на месте.
      </p>
      <a href="/dictionary-import-example.json" download>
        Скачать пример формата
      </a>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Файл академического словаря"
        disabled={busy}
        onChange={async (e) => {
          setPreview(null);
          setDictionary(null);
          setNotice('');
          setError('');
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 3 * 1024 * 1024) {
            setError('Файл должен быть не больше 3 МБ.');
            return;
          }
          try {
            setDictionary(JSON.parse(await f.text()));
          } catch {
            setError('Не удалось прочитать JSON.');
          }
        }}
      />
      <ErrorNotice text={error} />
      {notice && <p role="status">{notice}</p>}
      <button className="rr-button secondary" disabled={!dictionary || busy} onClick={() => void submit()}>
        Проверить файл
      </button>
      {preview && (
        <div className="sdvs-import-preview">
          <h3>
            Будет добавлено: {preview.added}, обновлено: {preview.updated}
          </h3>
          <p>
            {preview.source} · {preview.version}
          </p>
          {preview.sample.map((e: any) => (
            <p key={e.word}>
              <strong>{e.word}</strong> — {e.meaning}
            </p>
          ))}
          <button className="rr-button primary" disabled={busy} onClick={() => void submit(true)}>
            Сохранить проверенный словарь
          </button>
        </div>
      )}
    </section>
  );
}
