import {AdminPanel as ImpostorAdmin} from '../games/impostor';
import {AdminPanel as WhoamiAdmin} from '../games/whoami';
import {AdminPanel as AliasAdmin} from '../games/alias';
import { AdminPanel as BrokenTextAdmin } from '../games/broken-text/AdminPanel';
import { AdminPanel as BunkerAdmin } from '../games/bunker/AdminPanel';
import { AdminPanel as MafiaAdmin } from '../games/mafia/AdminPanel';
import { AdminPanel as DurakAdmin } from '../games/durak/AdminPanel';
import { http as durakHttp } from '../games/durak/client';
import { AdminPanel as JeopardyAdmin } from '../games/jeopardy/AdminPanel';
import { AdminPanel as RouletteAdmin } from '../games/roulette/AdminPanel';
import { api as gameApi } from '../games/jeopardy/client';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileJson,
  GraduationCap,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Save,
  Search,
  Server,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { api, useAuth } from '../api';
import '../admin.css';

type Section =
  | 'jeopardy' | 'roulette' | 'mafia' | 'bunker' | 'broken-text' | 'alias' | 'whoami' | 'impostor' | 'durak'
  | 'overview'
  | 'rules'
  | 'exercises'
  | 'lessons'
  | 'teacher'
  | 'categories'
  | 'import'
  | 'users'
  | 'servers'
  | 'audit';
type Role = 'admin' | 'editor' | 'moderator' | 'player';
type Category = { id: string; name: string };
type Rule = {
  id: string;
  title: string;
  categoryId: string;
  category?: string;
  subcategory: string;
  summary: string;
  explanation: string;
  examples: string[];
  mistakes: string[];
  images: string[];
  difficulty: number;
  games: string[];
  published: boolean;
  updatedAt?: string;
};
type Exercise = {
  id: string;
  ruleId: string;
  type: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  difficulty: number;
  examNumber?: number | null;
  published: boolean;
};
type Emotion = 'neutral' | 'happy' | 'strict' | 'surprised' | 'explaining';
type Block = {
  id: string;
  type: string;
  text?: string;
  image?: string;
  emotion?: Emotion;
  exerciseId?: string;
};
type Lesson = { id: string; ruleId: string; title: string; published: boolean; blocks: Block[] };
type Teacher = {
  name: string;
  images: Record<Emotion, string>;
  phrases: { intro: string; correct: string; incorrect: string; complete: string };
};
type Stats = {
  users: number;
  online: number;
  rooms: number;
  rules: number;
  exercises: number;
  lessons: number;
  games: number;
};
type AdminUser = { id: string; username: string; email: string; role: Role; xp: number; createdAt: string };
type AdminServer = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  memberCount?: number;
  roomCount?: number;
};
type Audit = { id: string; actorId: string; action: string; targetId: string; createdAt: string };
type Preview = { valid: boolean; errors: string[]; counts: { rules: number; exercises: number } };
type Notify = (message: string, error?: boolean) => void;

const nav: { key: Section; label: string; icon: typeof BookOpen; group: string; admin?: boolean }[] = [
  { key: 'overview', label: 'Обзор', icon: LayoutDashboard, group: 'ПРОСТРАНСТВО' },
  { key: 'rules', label: 'Правила', icon: BookOpen, group: 'УЧЕБНЫЕ МАТЕРИАЛЫ' },
  { key: 'exercises', label: 'Задания', icon: ClipboardList, group: '' },
  { key: 'lessons', label: 'Уроки', icon: GraduationCap, group: '' },
  { key: 'teacher', label: 'Учительница', icon: Sparkles, group: '' },
  { key: 'categories', label: 'Категории', icon: Settings2, group: '' },
  { key: 'import', label: 'Импорт', icon: Upload, group: '' },
  { key: 'users', label: 'Пользователи', icon: Users, group: 'УПРАВЛЕНИЕ', admin: true },
  { key: 'servers', label: 'Серверы', icon: Server, group: '', admin: true },
  { key: 'mafia', label: 'Мафия', icon: Sparkles, group: 'ИГРЫ' },
  { key: 'bunker', label: 'Бункер', icon: Sparkles, group: 'ИГРЫ' },
  { key: 'broken-text', label: 'Испорченный текст', icon: Sparkles, group: 'ИГРЫ' },
  {key:'alias',label:'Alias',icon:Sparkles,group:'ИГРЫ'},
  {key:'whoami',label:'Кто я',icon:Sparkles,group:'ИГРЫ'},
  {key:'impostor',label:'Самозванец',icon:Sparkles,group:'ИГРЫ'},
  { key: 'durak', label: 'Дурак', icon: Sparkles, group: 'ИГРЫ' },
  { key: 'jeopardy', label: 'Своя игра', icon: Sparkles, group: 'ИГРЫ' },
  { key: 'roulette', label: 'Русская рулетка', icon: Sparkles, group: '' },
  { key: 'audit', label: 'Журнал действий', icon: Shield, group: '', admin: true },
];
const gameOptions = [
  ['spy', 'Шпион'],
  ['mafia', 'Мафия'],
  ['bunker', 'Бункер'],
  ['durak', 'Дурак'],
  ['impostor', 'Самозванец'],
  ['whoami', 'Кто я?'],
  ['alias', 'Alias'],
  ['roulette', 'Русская рулетка'],
  ['jeopardy', 'Своя игра'],
  ['broken-text', 'Испорченный текст'],
];
const exerciseTypes = [
  ['letter', 'Вставка буквы'],
  ['choice', 'Один вариант ответа'],
  ['multiple', 'Несколько вариантов'],
  ['word', 'Ввод слова'],
  ['correction', 'Исправление предложения'],
  ['punctuation', 'Пунктуация'],
  ['matching', 'Соответствие'],
  ['stress', 'Ударение'],
  ['text', 'Задание по тексту'],
];
const blockTypes = [
  ['dialogue', 'Реплика'],
  ['explanation', 'Объяснение'],
  ['example', 'Пример'],
  ['image', 'Изображение'],
  ['exercise', 'Упражнение'],
  ['check', 'Проверка'],
  ['animation', 'Эмоция персонажа'],
  ['result', 'Результат'],
];
const emotions: [Emotion, string][] = [
  ['neutral', 'Нейтральная'],
  ['happy', 'Радостная'],
  ['strict', 'Строгая'],
  ['surprised', 'Удивлённая'],
  ['explaining', 'Объясняющая'],
];
const roles: [Role, string][] = [
  ['admin', 'Главный администратор'],
  ['editor', 'Редактор'],
  ['moderator', 'Модератор'],
  ['player', 'Игрок'],
];
const request = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : 'Не удалось выполнить действие. Попробуйте ещё раз.';
const lines = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
const dateLabel = (date?: string) =>
  date ? new Date(date).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const emptyRule = (): Rule => ({
  id: '',
  title: '',
  categoryId: '',
  subcategory: '',
  summary: '',
  explanation: '',
  examples: [],
  mistakes: [],
  images: [],
  difficulty: 1,
  games: ['spy'],
  published: false,
});
const emptyExercise = (): Exercise => ({
  id: '',
  ruleId: '',
  type: 'letter',
  prompt: '',
  options: [],
  answer: '',
  explanation: '',
  difficulty: 1,
  published: false,
});
const emptyLesson = (): Lesson => ({ id: '', ruleId: '', title: '', published: false, blocks: [] });
// getRandomValues works on local-network HTTP, unlike randomUUID on some browsers.
const blockId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`adm-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="adm-empty">
      <BookOpen size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Badge({ published }: { published: boolean }) {
  return (
    <span className={`adm-badge ${published ? 'published' : ''}`}>
      {published ? 'Опубликовано' : 'Черновик'}
    </span>
  );
}
function Loader() {
  return (
    <div className="adm-loading" role="status">
      <span />
      Загружаем данные…
    </div>
  );
}
function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="adm-error" role="alert">
      {error}
      {retry && (
        <button className="adm-btn small" onClick={retry}>
          Повторить
        </button>
      )}
    </div>
  );
}
function Confirm({
  title,
  text,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="adm-overlay" role="presentation">
      <section className="adm-modal" role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title">
        <span className="adm-danger-icon">
          <Trash2 size={23} />
        </span>
        <h2 id="adm-confirm-title">{title}</h2>
        <p>{text}</p>
        <div className="adm-actions">
          <button className="adm-btn" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button className="adm-btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Удаляем…' : 'Удалить'}
          </button>
        </div>
      </section>
    </div>
  );
}
async function uploadFile(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Выберите изображение PNG, JPEG или WebP.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Изображение должно быть не больше 2 МБ.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsDataURL(file);
  });
  return (await api<{ url: string }>('/admin/uploads', request('POST', { data }))).url;
}
function ImageUpload({
  label = 'Загрузить изображение',
  onUpload,
  notify,
}: {
  label?: string;
  onUpload: (url: string) => void;
  notify: Notify;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={`adm-btn upload${busy ? ' busy' : ''}`}>
      <ImagePlus size={16} />
      {busy ? 'Загружаем…' : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            onUpload(await uploadFile(file));
          } catch (err) {
            notify(messageOf(err), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}
function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(messageOf(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, reload: () => setRevision((n) => n + 1) };
}

export default function AdminApp() {
  const { user, loading, login, logout, refresh } = useAuth();
  const fromHash = () => nav.find((n) => n.key === location.hash.slice(1))?.key ?? 'overview';
  const [section, setSection] = useState<Section>(fromHash);
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  useEffect(() => {
    const update = () => setSection(fromHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.error ? 10000 : 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const notify: Notify = (message, error = false) => setNotice({ message, error });
  const go = (next: Section) => {
    location.hash = next;
    setSection(next);
    setMobile(false);
  };
  if (loading)
    return (
      <div className="adm-root adm-auth-page">
        <Loader />
      </div>
    );
  if (!user) return <Login login={login} />;
  if (!['admin', 'editor'].includes(user.role))
    return (
      <div className="adm-root adm-auth-page">
        <div className="adm-auth-card">
          <span className="adm-logo-icon">
            <Shield />
          </span>
          <span className="adm-eyebrow">РУССКИЙ ROYALE ADMIN</span>
          <h1>Это пространство редакторов</h1>
          <p>
            Вы вошли как <strong>{user.username}</strong>. Для доступа нужна роль редактора или главного
            администратора.
          </p>
          <div className="adm-info">
            Владелец проекта может назначить первого администратора в терминале на сервере:
            <code>npm run admin -- {user.email}</code>После назначения обновите доступ.
          </div>
          <button className="adm-btn primary" onClick={() => void refresh()}>
            Обновить доступ
          </button>
          <a className="adm-text-link" href="/">
            Вернуться на игровой сайт <ChevronRight size={16} />
          </a>
          <button className="adm-btn text" onClick={() => void logout()}>
            Войти в другой аккаунт
          </button>
        </div>
      </div>
    );
  const chosen = nav.find((item) => item.key === section)!;
  const unauthorizedSection = chosen.admin && user.role !== 'admin';
  return (
    <div className="adm-root">
      {mobile && (
        <button className="adm-sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMobile(false)} />
      )}
      <aside className={`adm-sidebar${mobile ? ' open' : ''}`}>
        <a className="adm-brand" href="/admin.html">
          <span className="adm-logo-icon">
            <Shield size={23} />
          </span>
          <span>
            РУССКИЙ
            <span className="adm-brand-bottom">
              ROYALE <b>ADMIN</b>
            </span>
          </span>
        </a>
        <div className="adm-workspace">
          <span className="adm-workspace-dot" />
          <div>
            Панель управления<small>Общее пространство команды</small>
          </div>
        </div>
        <nav aria-label="Административные разделы">
          {nav
            .filter((item) => !item.admin || user.role === 'admin')
            .map((item) => (
              <div key={item.key}>
                {item.group && <span className="adm-nav-group">{item.group}</span>}
                <button
                  className={`adm-nav-item${section === item.key ? ' active' : ''}`}
                  onClick={() => go(item.key)}
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                  {section === item.key && <span className="adm-active-dot" />}
                </button>
              </div>
            ))}
        </nav>
        <div className="adm-sidebar-bottom">
          <a className="adm-return" href="/">
            <ArrowLeft size={17} /> На игровой сайт
          </a>
          <div className="adm-account">
            <span className="adm-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{user.username}</strong>
              <small>{user.role === 'admin' ? 'Администратор' : 'Редактор'}</small>
            </div>
            <button aria-label="Выйти" onClick={() => void logout()}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="adm-main">
        <header className="adm-topbar">
          <button className="adm-mobile-menu" aria-label="Открыть меню" onClick={() => setMobile(true)}>
            <Menu />
          </button>
          <div className="adm-breadcrumb">
            Рабочее пространство <ChevronRight size={14} />
            <strong>{chosen.label}</strong>
          </div>
          <span className="adm-top-badge">
            <Shield size={13} /> Закрытая панель
          </span>
        </header>
        <main className="adm-content">
          <div className="adm-page-heading">
            <div>
              <span className="adm-eyebrow">РУССКИЙ ROYALE / РЕДАКТОРСКАЯ</span>
              <h1>{section === 'overview' ? 'Здесь начинается знание' : chosen.label}</h1>
              <p>
                {
                  (
                    {
                      overview: 'Создавайте материалы, из которых рождаются уроки и игры.',
                      rules: 'Единая библиотека для справочника, уроков и игровых раундов.',
                      exercises: 'Задачи, которые помогают разобраться, а не просто угадать.',
                      lessons: 'Собирайте историю урока из реплик, примеров и упражнений.',
                      teacher: 'Характер, настроение и голос вашего проводника в русский язык.',
                      categories: 'Дайте материалам понятную структуру.',
                      import: 'Добавляйте материалы пакетами с проверкой перед сохранением.',
                      users: 'Роли определяют доступ. Все изменения записываются в журнал.',
                      servers: 'Игровые сообщества и управление их доступностью.',
                      audit: 'История изменений общей базы материалов.',
                    } as Record<Section, string>
                  )[section]
                }
              </p>
            </div>
            <span className="adm-heading-symbol">
              <chosen.icon size={25} />
            </span>
          </div>
          {unauthorizedSection ? (
            <ErrorBox error="Этот раздел доступен только главному администратору." />
          ) : (
            <>
              {section === 'mafia' && <MafiaAdmin api={durakHttp} roles={[user.role]}/>}
              {section === 'bunker' && <BunkerAdmin api={durakHttp} roles={[user.role]}/>}
              {section === 'broken-text' && <BrokenTextAdmin api={durakHttp} roles={[user.role]}/>}
              {section === 'alias' && <AliasAdmin permissions={{canEdit:['admin','editor'].includes(user.role)}} api={(path,options)=>durakHttp(path,{method:options?.method,body:options?.body===undefined?undefined:JSON.stringify(options.body)})}/>}
              {section === 'whoami' && <WhoamiAdmin permissions={{canEdit:['admin','editor'].includes(user.role)}} api={(path,options)=>durakHttp(path,{method:options?.method,body:options?.body===undefined?undefined:JSON.stringify(options.body)})}/>}
              {section === 'impostor' && <ImpostorAdmin permissions={{canEdit:['admin','editor'].includes(user.role)}} api={(path,options)=>durakHttp(path,{method:options?.method,body:options?.body===undefined?undefined:JSON.stringify(options.body)})}/>}
              {section === 'durak' && <DurakAdmin api={durakHttp} roles={[user.role]}/>}
              {section === 'jeopardy' && <JeopardyAdmin api={gameApi} role={user.role}/>}
              {section === 'roulette' && <RouletteAdmin api={gameApi} role={user.role}/>}
              {section === 'overview' && <Overview go={go} />}
              {section === 'rules' && <RulesEditor notify={notify} />}
              {section === 'exercises' && <ExercisesEditor notify={notify} />}
              {section === 'lessons' && <LessonsEditor notify={notify} />}
              {section === 'teacher' && <TeacherEditor notify={notify} />}
              {section === 'categories' && <CategoriesEditor notify={notify} />}
              {section === 'import' && <ImportEditor notify={notify} />}
              {section === 'users' && <UsersEditor selfId={user.id} notify={notify} />}
              {section === 'servers' && <ServersEditor notify={notify} />}
              {section === 'audit' && <AuditLog />}
            </>
          )}
          <footer className="adm-footer">
            <span>Русский Royale · Редакторская</span>
            <span>Материалы живут в общей базе данных</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className={`adm-toast${notice.error ? ' error' : ''}`} role={notice.error ? 'alert' : 'status'}>
          {notice.error ? <X size={18} /> : <Check size={18} />}
          <span>{notice.message}</span>
          <button aria-label="Закрыть уведомление" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Login({ login }: { login: (email: string, password: string) => Promise<unknown> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="adm-root adm-auth-page">
      <div className="adm-auth-card">
        <a className="adm-auth-home" href="/">
          <ArrowLeft size={16} /> На игровой сайт
        </a>
        <span className="adm-logo-icon">
          <Shield />
        </span>
        <span className="adm-eyebrow">РУССКИЙ ROYALE ADMIN</span>
        <h1>Знания начинаются с вас.</h1>
        <p>Войдите в редакторскую, чтобы создавать уроки и управлять платформой.</p>
        <form onSubmit={submit}>
          <Field label="Электронная почта">
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.ru"
            />
          </Field>
          <Field label="Пароль">
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <ErrorBox error={error} />}
          <button className="adm-btn primary" disabled={busy}>
            {busy ? 'Входим…' : 'Войти в редакторскую'}
            <ChevronRight size={17} />
          </button>
        </form>
        <small>Единый аккаунт с игровым сайтом. Доступ предоставляется администратором.</small>
      </div>
      <div className="adm-auth-art" aria-hidden="true">
        <BookOpen />
        <span>
          Одна идея.
          <br />
          <b>Тысячи открытий.</b>
        </span>
        <i />
      </div>
    </div>
  );
}

function Overview({ go }: { go: (section: Section) => void }) {
  const { data, loading, error, reload } = useResource<Stats>('/admin/stats');
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const cards = [
    { label: 'Правил в библиотеке', value: data?.rules, icon: BookOpen, color: 'purple', target: 'rules' },
    {
      label: 'Учебных заданий',
      value: data?.exercises,
      icon: ClipboardList,
      color: 'blue',
      target: 'exercises',
    },
    {
      label: 'Интерактивных уроков',
      value: data?.lessons,
      icon: GraduationCap,
      color: 'green',
      target: 'lessons',
    },
    { label: 'Пользователей', value: data?.users, icon: Users, color: 'orange', target: null },
  ];
  return (
    <>
      <div className="adm-stats-grid">
        {cards.map((card) => (
          <div className="adm-stat-card" key={card.label}>
            <span className={`adm-stat-icon ${card.color}`}>
              <card.icon size={20} />
            </span>
            <strong>{card.value ?? 0}</strong>
            <span>{card.label}</span>
            {card.target && (
              <button
                className="adm-stat-link"
                aria-label={`Открыть ${card.label.toLowerCase()}`}
                onClick={() => go(card.target as Section)}
              >
                <ChevronRight size={17} />
              </button>
            )}
          </div>
        ))}
      </div>
      <section className="adm-overview-hero">
        <div>
          <span className="adm-eyebrow">ОТ ИДЕИ К ПЕРВОМУ УРОКУ</span>
          <h2>
            Добавьте правило.
            <br />
            Дайте ему ожить.
          </h2>
          <p>
            Напишите объяснение, добавьте примеры и задания. Опубликованные материалы появятся на сайте и
            станут темами для игры «Шпион».
          </p>
          <button className="adm-btn white" onClick={() => go('rules')}>
            <Plus size={17} /> Открыть редактор правил
          </button>
        </div>
        <div className="adm-hero-graphic" aria-hidden="true">
          <div className="adm-graphic-book">
            <BookOpen size={68} />
            <span>Аа</span>
          </div>
          <i className="adm-float-star">✦</i>
          <i className="adm-float-dot" />
          <div className="adm-graphic-label">
            <Check size={15} /> Готово к открытию
          </div>
        </div>
      </section>
      <div className="adm-overview-columns">
        <section className="adm-panel">
          <div className="adm-panel-title">
            <h2>Быстрый старт</h2>
            <span>Три шага к уроку</span>
          </div>
          {[
            {
              title: 'Создайте учебный материал',
              text: 'Правило, объяснение и понятные примеры.',
              to: 'rules',
              icon: BookOpen,
            },
            {
              title: 'Добавьте практику',
              text: 'Ответы проверит сервер, а ученик увидит объяснение.',
              to: 'exercises',
              icon: ClipboardList,
            },
            {
              title: 'Соберите интерактивный урок',
              text: 'Чередуйте реплики учительницы и упражнения.',
              to: 'lessons',
              icon: GraduationCap,
            },
          ].map((item, i) => (
            <button className="adm-quick-row" onClick={() => go(item.to as Section)} key={item.to}>
              <span className="adm-step">0{i + 1}</span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </div>
              <ChevronRight size={18} />
            </button>
          ))}
        </section>
        <section className="adm-panel">
          <div className="adm-panel-title">
            <h2>На платформе сейчас</h2>
            <button className="adm-btn text small" onClick={reload}>
              Обновить
            </button>
          </div>
          <div className="adm-live-row">
            <span>
              <i /> Онлайн
            </span>
            <strong>{data?.online ?? 0}</strong>
          </div>
          <div className="adm-live-row">
            <span>Игровых комнат</span>
            <strong>{data?.rooms ?? 0}</strong>
          </div>
          <div className="adm-live-row">
            <span>Сыгранных партий</span>
            <strong>{data?.games ?? 0}</strong>
          </div>
          <div className="adm-soft-note">
            <Shield size={18} />
            <p>
              Права проверяются на сервере. Редакторы работают с материалами; доступ к ролям есть только у
              администратора.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function RulesEditor({ notify }: { notify: Notify }) {
  const resource = useResource<Rule[]>('/admin/rules');
  const categories = useResource<Category[]>('/admin/categories');
  const [draft, setDraft] = useState<Rule | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const [preview, setPreview] = useState(false);
  const patch = (updates: Partial<Rule>) =>
    setDraft((current) => (current ? { ...current, ...updates } : current));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await api<Rule>(
        `/admin/rules${draft.id ? `/${draft.id}` : ''}`,
        request(draft.id ? 'PUT' : 'POST', draft),
      );
      setDraft(saved);
      resource.reload();
      notify('Правило сохранено.');
    } catch (err) {
      notify(messageOf(err), true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/admin/rules/${deleting.id}`, request('DELETE'));
      if (draft?.id === deleting.id) setDraft(null);
      setDeleting(null);
      resource.reload();
      notify('Правило удалено. История завершённых игр сохранена.');
    } catch (err) {
      notify(messageOf(err), true);
    } finally {
      setBusy(false);
    }
  }
  const filtered = (resource.data ?? []).filter((item) =>
    `${item.title} ${item.category ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={17} />
          <input
            aria-label="Поиск правил"
            placeholder="Найти правило…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="adm-btn primary"
          onClick={() => setDraft({ ...emptyRule(), categoryId: categories.data?.[0]?.id ?? '' })}
        >
          <Plus size={17} /> Новое правило
        </button>
      </div>
      {resource.error && <ErrorBox error={resource.error} retry={resource.reload} />}
      {categories.error && <ErrorBox error={categories.error} retry={categories.reload} />}
      <div className={`adm-editor-layout${draft ? ' has-editor' : ''}`}>
        <section className="adm-panel adm-list-panel">
          <div className="adm-panel-title">
            <h2>Библиотека</h2>
            <span>{resource.data?.length ?? 0} материалов</span>
          </div>
          {resource.loading ? (
            <Loader />
          ) : filtered.length ? (
            filtered.map((rule) => (
              <button
                className={`adm-content-item${draft?.id === rule.id ? ' selected' : ''}`}
                key={rule.id}
                onClick={() => setDraft(structuredClone(rule))}
              >
                <span className="adm-item-icon">
                  <BookOpen size={20} />
                </span>
                <div>
                  <strong>{rule.title}</strong>
                  <small>
                    {rule.category ||
                      categories.data?.find((c) => c.id === rule.categoryId)?.name ||
                      'Без категории'}
                  </small>
                  <Badge published={rule.published} />
                </div>
                <ChevronRight size={17} />
              </button>
            ))
          ) : (
            <Empty
              title={query ? 'Ничего не найдено' : 'Здесь появятся ваши правила'}
              text={
                query
                  ? 'Попробуйте другое название.'
                  : 'Создайте первый материал и опубликуйте его для учеников.'
              }
            />
          )}
        </section>
        {draft && (
          <form className="adm-panel adm-editor-form" onSubmit={save}>
            <div className="adm-editor-title">
              <div>
                <span className="adm-eyebrow">{draft.id ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ МАТЕРИАЛ'}</span>
                <h2>{draft.title || 'Новое правило'}</h2>
              </div>
              <button
                type="button"
                className="adm-icon-btn"
                aria-label="Закрыть редактор"
                onClick={() => setDraft(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="adm-form-grid">
              {draft.id && (
                <Field label="ID правила для импорта заданий" wide>
                  <input readOnly value={draft.id} onFocus={(e) => e.target.select()} />
                </Field>
              )}
              <Field label="Название правила" wide>
                <input
                  required
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Например, название изучаемой темы"
                />
              </Field>
              <Field label="Категория">
                <select
                  required
                  value={draft.categoryId}
                  onChange={(e) => patch({ categoryId: e.target.value })}
                >
                  <option value="">Выберите категорию</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Подкатегория">
                <input
                  maxLength={100}
                  value={draft.subcategory ?? ''}
                  onChange={(e) => patch({ subcategory: e.target.value })}
                  placeholder="Необязательно"
                />
              </Field>
              <Field label="Краткое объяснение" wide>
                <textarea
                  rows={2}
                  maxLength={1000}
                  required
                  value={draft.summary}
                  onChange={(e) => patch({ summary: e.target.value })}
                  placeholder="Главная мысль в двух предложениях"
                />
              </Field>
              <Field
                label="Полное объяснение"
                wide
                hint="Обычный текст. Абзацы и переносы строк сохраняются."
              >
                <textarea
                  rows={5}
                  maxLength={20000}
                  required
                  value={draft.explanation}
                  onChange={(e) => patch({ explanation: e.target.value })}
                />
              </Field>
              <Field label="Примеры" hint="Каждый пример — с новой строки.">
                <textarea
                  rows={4}
                  value={draft.examples.join('\n')}
                  onChange={(e) => patch({ examples: e.target.value.split('\n') })}
                />
              </Field>
              <Field label="Типичные ошибки" hint="Каждая ошибка — с новой строки.">
                <textarea
                  rows={4}
                  value={draft.mistakes.join('\n')}
                  onChange={(e) => patch({ mistakes: e.target.value.split('\n') })}
                />
              </Field>
              <Field label="Уровень сложности">
                <select
                  value={draft.difficulty}
                  onChange={(e) => patch({ difficulty: Number(e.target.value) })}
                >
                  <option value={1}>Базовый</option>
                  <option value={2}>Средний</option>
                  <option value={3}>Продвинутый</option>
                </select>
              </Field>
              <div className="adm-field wide">
                <span>Использование в играх</span>
                <div className="adm-chips">
                  {gameOptions.map(([value, label]) => (
                    <label
                      className={`adm-check-chip${draft.games.includes(value) ? ' checked' : ''}`}
                      key={value}
                    >
                      <input
                        type="checkbox"
                        checked={draft.games.includes(value)}
                        onChange={(e) =>
                          patch({
                            games: e.target.checked
                              ? [...draft.games, value]
                              : draft.games.filter((game) => game !== value),
                          })
                        }
                      />
                      {label}
                      {value !== 'spy' && <small>позже</small>}
                    </label>
                  ))}
                </div>
                <small>
                  В первой версии доступен «Шпион». Отметки других игр сохраняются для следующих этапов.
                </small>
              </div>
              <div className="adm-field wide">
                <span>Изображения к правилу</span>
                <div className="adm-image-list">
                  {draft.images.map((image, i) => (
                    <div className="adm-image-thumb" key={`${image}-${i}`}>
                      <img src={image} alt={`Иллюстрация ${i + 1}`} />
                      <button
                        type="button"
                        aria-label={`Удалить изображение ${i + 1}`}
                        onClick={() => patch({ images: draft.images.filter((_, index) => index !== i) })}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <ImageUpload onUpload={(url) => patch({ images: [...draft.images, url] })} notify={notify} />
                <small>PNG, JPEG или WebP, до 2 МБ.</small>
              </div>
            </div>
            <label className="adm-publish">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => patch({ published: e.target.checked })}
              />
              <div>
                <strong>Опубликовать материал</strong>
                <small>Ученики увидят правило, а игры смогут использовать его.</small>
              </div>
            </label>
            <div className="adm-editor-actions">
              <button className="adm-btn primary" disabled={busy}>
                <Save size={16} />
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
              <button type="button" className="adm-btn" onClick={() => setPreview(true)}>
                <Eye size={16} />
                Предпросмотр
              </button>
              {draft.id && (
                <button type="button" className="adm-btn danger-ghost" onClick={() => setDeleting(draft)}>
                  <Trash2 size={16} />
                  Удалить
                </button>
              )}
            </div>
            <small className="adm-save-hint">Изменения вступают в силу после сохранения.</small>
          </form>
        )}
      </div>
      {deleting && (
        <Confirm
          title="Удалить правило?"
          text={`«${deleting.title}» исчезнет из библиотеки. Связанные учебные материалы могут быть удалены вместе с ним; завершённые и уже начавшиеся игры сохранят свой снимок темы.`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      )}
      {preview && draft && (
        <div className="adm-overlay">
          <section
            className="adm-modal adm-preview"
            role="dialog"
            aria-modal="true"
            aria-label="Предпросмотр правила"
          >
            <button
              className="adm-icon-btn adm-modal-close"
              aria-label="Закрыть предпросмотр"
              onClick={() => setPreview(false)}
            >
              <X />
            </button>
            <span className="adm-eyebrow">ПРЕДПРОСМОТР · ЕЩЁ НЕ СОХРАНЕНО</span>
            <h2>{draft.title || 'Название правила'}</h2>
            <Badge published={draft.published} />
            <p className="adm-preview-summary">{draft.summary}</p>
            <p className="adm-preserve">{draft.explanation}</p>
            {draft.examples.length > 0 && (
              <>
                <h3>Примеры</h3>
                <ul>
                  {draft.examples.filter(Boolean).map((example, i) => (
                    <li key={i}>{example}</li>
                  ))}
                </ul>
              </>
            )}
            {draft.mistakes.some(Boolean) && (
              <>
                <h3>Обратите внимание</h3>
                <ul>
                  {draft.mistakes.filter(Boolean).map((example, i) => (
                    <li key={i}>{example}</li>
                  ))}
                </ul>
              </>
            )}
            {draft.images.map((image, i) => (
              <img key={i} src={image} alt={`Иллюстрация ${i + 1}`} />
            ))}
          </section>
        </div>
      )}
    </>
  );
}

function ExercisesEditor({ notify }: { notify: Notify }) {
  const resource = useResource<Exercise[]>('/admin/exercises');
  const rules = useResource<Rule[]>('/admin/rules');
  const [draft, setDraft] = useState<Exercise | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Exercise | null>(null);
  const patch = (updates: Partial<Exercise>) => setDraft((d) => (d ? { ...d, ...updates } : d));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<Exercise>(
        `/admin/exercises${draft.id ? `/${draft.id}` : ''}`,
        request(draft.id ? 'PUT' : 'POST', {
          ...draft,
          options: draft.options.filter(Boolean),
          examNumber: draft.examNumber || null,
        }),
      );
      setDraft(result);
      resource.reload();
      notify('Задание сохранено.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/admin/exercises/${deleting.id}`, request('DELETE'));
      if (draft?.id === deleting.id) setDraft(null);
      setDeleting(null);
      resource.reload();
      notify('Задание удалено.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={17} />
          <input
            aria-label="Поиск заданий"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти задание…"
          />
        </div>
        <button
          className="adm-btn primary"
          onClick={() => setDraft({ ...emptyExercise(), ruleId: rules.data?.[0]?.id ?? '' })}
        >
          <Plus size={17} />
          Новое задание
        </button>
      </div>
      {resource.error && <ErrorBox error={resource.error} retry={resource.reload} />}
      {rules.error && <ErrorBox error={rules.error} retry={rules.reload} />}
      <div className={`adm-editor-layout${draft ? ' has-editor' : ''}`}>
        <section className="adm-panel adm-list-panel">
          <div className="adm-panel-title">
            <h2>Практика</h2>
            <span>{resource.data?.length ?? 0} заданий</span>
          </div>
          {resource.loading ? (
            <Loader />
          ) : (
            resource.data
              ?.filter((item) => item.prompt.toLowerCase().includes(query.toLowerCase()))
              .map((item) => (
                <button
                  className={`adm-content-item${draft?.id === item.id ? ' selected' : ''}`}
                  key={item.id}
                  onClick={() => setDraft(structuredClone(item))}
                >
                  <span className="adm-item-icon">
                    <ClipboardList size={20} />
                  </span>
                  <div>
                    <strong>{item.prompt}</strong>
                    <small>{exerciseTypes.find(([type]) => type === item.type)?.[1]}</small>
                    <Badge published={item.published} />
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))
          )}
          {!resource.loading && !resource.data?.length && (
            <Empty title="Практика начинается с вопроса" text="Добавьте задание и свяжите его с правилом." />
          )}
        </section>
        {draft && (
          <form className="adm-panel adm-editor-form" onSubmit={save}>
            <div className="adm-editor-title">
              <h2>{draft.id ? 'Редактировать задание' : 'Новое задание'}</h2>
              <button
                type="button"
                className="adm-icon-btn"
                aria-label="Закрыть редактор"
                onClick={() => setDraft(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="adm-form-grid">
              <Field label="Правило" wide>
                <select required value={draft.ruleId} onChange={(e) => patch({ ruleId: e.target.value })}>
                  <option value="">Выберите правило</option>
                  {rules.data?.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Тип задания">
                <select value={draft.type} onChange={(e) => patch({ type: e.target.value })}>
                  {exerciseTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Сложность">
                <select
                  value={draft.difficulty}
                  onChange={(e) => patch({ difficulty: Number(e.target.value) })}
                >
                  <option value={1}>Базовая</option>
                  <option value={2}>Средняя</option>
                  <option value={3}>Продвинутая</option>
                </select>
              </Field>
              <Field label="Условие" wide>
                <textarea
                  rows={4}
                  required
                  maxLength={10000}
                  value={draft.prompt}
                  onChange={(e) => patch({ prompt: e.target.value })}
                />
              </Field>
              <Field
                label="Варианты ответа"
                wide
                hint="Каждый вариант с новой строки. Для свободного ответа оставьте пустым."
              >
                <textarea
                  rows={3}
                  value={draft.options.join('\n')}
                  onChange={(e) => patch({ options: e.target.value.split('\n') })}
                />
              </Field>
              <Field
                label="Правильный ответ"
                wide
                hint={
                  draft.type === 'multiple'
                    ? 'Перечислите правильные варианты через точку с запятой: А;В. Порядок не важен.'
                    : draft.type === 'matching'
                      ? 'Задайте формат в условии: например, 1-А;2-Б;3-В. Пары разделяются точкой с запятой, порядок не важен.'
                      : draft.type === 'stress'
                        ? 'Обозначьте ударение однозначным способом в условии, например, номером ударного слога.'
                        : 'Ожидаемая буква, слово или строка. Ответ хранится на сервере.'
                }
              >
                <input
                  required
                  maxLength={5000}
                  value={draft.answer}
                  onChange={(e) => patch({ answer: e.target.value })}
                />
              </Field>
              <Field label="Объяснение после ответа" wide>
                <textarea
                  rows={3}
                  required
                  maxLength={10000}
                  value={draft.explanation}
                  onChange={(e) => patch({ explanation: e.target.value })}
                />
              </Field>
              <Field
                label="Номер задания ЕГЭ (необязательно)"
                hint="Метка для будущего тренажёра. Не задаёт официальную схему оценивания."
              >
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={draft.examNumber ?? ''}
                  onChange={(e) => patch({ examNumber: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
            </div>
            <label className="adm-publish">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => patch({ published: e.target.checked })}
              />
              <div>
                <strong>Опубликовать задание</strong>
                <small>Само правило также должно быть опубликовано.</small>
              </div>
            </label>
            <div className="adm-editor-actions">
              <button className="adm-btn primary" disabled={busy}>
                <Save size={16} />
                {busy ? 'Сохраняем…' : 'Сохранить'}
              </button>
              {draft.id && (
                <button type="button" className="adm-btn danger-ghost" onClick={() => setDeleting(draft)}>
                  <Trash2 size={16} />
                  Удалить
                </button>
              )}
            </div>
          </form>
        )}
      </div>
      {deleting && (
        <Confirm
          title="Удалить задание?"
          text="Задание исчезнет из практики. Проверьте уроки, в которых оно использовалось."
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

function LessonsEditor({ notify }: { notify: Notify }) {
  const resource = useResource<Lesson[]>('/admin/lessons');
  const rules = useResource<Rule[]>('/admin/rules');
  const exercises = useResource<Exercise[]>('/admin/exercises');
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [newType, setNewType] = useState('dialogue');
  const patch = (updates: Partial<Lesson>) => setDraft((d) => (d ? { ...d, ...updates } : d));
  function patchBlock(id: string, updates: Partial<Block>) {
    if (draft) patch({ blocks: draft.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)) });
  }
  function move(index: number, shift: number) {
    if (!draft || index + shift < 0 || index + shift >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[index], blocks[index + shift]] = [blocks[index + shift], blocks[index]];
    patch({ blocks });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<Lesson>(
        `/admin/lessons${draft.id ? `/${draft.id}` : ''}`,
        request(draft.id ? 'PUT' : 'POST', draft),
      );
      setDraft(result);
      resource.reload();
      notify('Урок сохранён.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/admin/lessons/${deleting.id}`, request('DELETE'));
      if (draft?.id === deleting.id) setDraft(null);
      setDeleting(null);
      resource.reload();
      notify('Урок удалён.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="adm-toolbar">
        <span className="adm-toolbar-note">
          <GraduationCap size={18} /> Уроки собираются из блоков
        </span>
        <button
          className="adm-btn primary"
          onClick={() => setDraft({ ...emptyLesson(), ruleId: rules.data?.[0]?.id ?? '' })}
        >
          <Plus size={17} />
          Новый урок
        </button>
      </div>
      {resource.error && <ErrorBox error={resource.error} retry={resource.reload} />}
      {rules.error && <ErrorBox error={rules.error} retry={rules.reload} />}
      {exercises.error && <ErrorBox error={exercises.error} retry={exercises.reload} />}
      <div className={`adm-editor-layout${draft ? ' has-editor' : ''}`}>
        <section className="adm-panel adm-list-panel">
          <div className="adm-panel-title">
            <h2>Сценарии уроков</h2>
            <span>{resource.data?.length ?? 0}</span>
          </div>
          {resource.loading ? (
            <Loader />
          ) : (
            resource.data?.map((lesson) => (
              <button
                key={lesson.id}
                className={`adm-content-item${draft?.id === lesson.id ? ' selected' : ''}`}
                onClick={() => setDraft(structuredClone(lesson))}
              >
                <span className="adm-item-icon">
                  <GraduationCap size={20} />
                </span>
                <div>
                  <strong>{lesson.title}</strong>
                  <small>{lesson.blocks.length} блоков</small>
                  <Badge published={lesson.published} />
                </div>
                <ChevronRight size={16} />
              </button>
            ))
          )}
          {!resource.loading && !resource.data?.length && (
            <Empty
              title="Первый урок ждёт своей истории"
              text="Добавьте диалог, объяснение и немного практики."
            />
          )}
        </section>
        {draft && (
          <form className="adm-panel adm-editor-form" onSubmit={save}>
            <div className="adm-editor-title">
              <h2>{draft.id ? 'Сценарий урока' : 'Новый урок'}</h2>
              <button
                type="button"
                className="adm-icon-btn"
                aria-label="Закрыть редактор"
                onClick={() => setDraft(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="adm-form-grid">
              <Field label="Название урока" wide>
                <input
                  required
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </Field>
              <Field label="Правило" wide>
                <select required value={draft.ruleId} onChange={(e) => patch({ ruleId: e.target.value })}>
                  <option value="">Выберите правило</option>
                  {rules.data?.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="adm-block-list">
              {draft.blocks.map((block, index) => (
                <div className="adm-lesson-block" key={block.id}>
                  <div className="adm-block-heading">
                    <span className="adm-block-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{blockTypes.find(([type]) => type === block.type)?.[1] ?? block.type}</strong>
                    <div className="adm-block-tools">
                      <button
                        type="button"
                        aria-label={`Поднять блок ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Опустить блок ${index + 1}`}
                        disabled={index === draft.blocks.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Удалить блок ${index + 1}`}
                        onClick={() => patch({ blocks: draft.blocks.filter((b) => b.id !== block.id) })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="adm-block-fields">
                    <Field label="Тип блока">
                      <select
                        value={block.type}
                        onChange={(e) => patchBlock(block.id, { type: e.target.value })}
                      >
                        {blockTypes.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Эмоция">
                      <select
                        value={block.emotion ?? 'neutral'}
                        onChange={(e) => patchBlock(block.id, { emotion: e.target.value as Emotion })}
                      >
                        {emotions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {['exercise', 'check'].includes(block.type) ? (
                      <Field label="Задание" wide>
                        <select
                          required
                          value={block.exerciseId ?? ''}
                          onChange={(e) => patchBlock(block.id, { exerciseId: e.target.value })}
                        >
                          <option value="">Выберите задание этого правила</option>
                          {exercises.data
                            ?.filter((exercise) => exercise.ruleId === draft.ruleId)
                            .map((exercise) => (
                              <option key={exercise.id} value={exercise.id}>
                                {exercise.prompt}
                                {exercise.published ? '' : ' (черновик)'}
                              </option>
                            ))}
                        </select>
                      </Field>
                    ) : (
                      <Field label={block.type === 'dialogue' ? 'Реплика учительницы' : 'Содержание'} wide>
                        <textarea
                          rows={3}
                          value={block.text ?? ''}
                          onChange={(e) => patchBlock(block.id, { text: e.target.value })}
                        />
                      </Field>
                    )}
                    {block.type === 'image' && (
                      <div className="adm-field wide">
                        <span>Иллюстрация</span>
                        {block.image && (
                          <img className="adm-block-image" src={block.image} alt="Иллюстрация блока" />
                        )}
                        <ImageUpload
                          onUpload={(url) => patchBlock(block.id, { image: url })}
                          notify={notify}
                        />
                        {block.image && (
                          <button
                            type="button"
                            className="adm-btn text small"
                            onClick={() => patchBlock(block.id, { image: '' })}
                          >
                            Убрать изображение
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="adm-add-block">
              <select
                aria-label="Тип нового блока"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {blockTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="adm-btn"
                onClick={() =>
                  patch({
                    blocks: [...draft.blocks, { id: blockId(), type: newType, text: '', emotion: 'neutral' }],
                  })
                }
              >
                <Plus size={16} />
                Добавить блок
              </button>
            </div>
            <label className="adm-publish">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => patch({ published: e.target.checked })}
              />
              <div>
                <strong>Опубликовать урок</strong>
                <small>Опубликуйте также правило и используемые упражнения.</small>
              </div>
            </label>
            <div className="adm-editor-actions">
              <button className="adm-btn primary" disabled={busy}>
                <Save size={16} />
                {busy ? 'Сохраняем…' : 'Сохранить сценарий'}
              </button>
              {draft.id && (
                <button type="button" className="adm-btn danger-ghost" onClick={() => setDeleting(draft)}>
                  <Trash2 size={16} />
                  Удалить
                </button>
              )}
            </div>
          </form>
        )}
      </div>
      {deleting && (
        <Confirm
          title="Удалить урок?"
          text={`Сценарий «${deleting.title}» больше не будет доступен ученикам.`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

function TeacherEditor({ notify }: { notify: Notify }) {
  const resource = useResource<Teacher>('/admin/teacher');
  const [draft, setDraft] = useState<Teacher | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Emotion>('neutral');
  useEffect(() => {
    if (resource.data) setDraft(structuredClone(resource.data));
  }, [resource.data]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      await api('/admin/teacher', request('PUT', draft));
      notify('Персонаж и реплики сохранены.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading) return <Loader />;
  if (resource.error) return <ErrorBox error={resource.error} retry={resource.reload} />;
  if (!draft) return null;
  const labels: Record<keyof Teacher['phrases'], string> = {
    intro: 'Приветствие',
    correct: 'Правильный ответ',
    incorrect: 'Ошибка',
    complete: 'Завершение урока',
  };
  return (
    <form onSubmit={save}>
      <div className="adm-teacher-layout">
        <section className="adm-panel adm-teacher-preview">
          <span className="adm-eyebrow">ВАШ ПЕРСОНАЖ</span>
          <div className="adm-teacher-stage">
            <div className="adm-teacher-grid" />
            {draft.images[selected] ? (
              <img
                src={draft.images[selected]}
                alt={`${draft.name}: ${emotions.find(([emotion]) => emotion === selected)?.[1]}`}
              />
            ) : (
              <span className="adm-no-image">Загрузите изображение</span>
            )}
            <i className="adm-stage-star one">✦</i>
            <i className="adm-stage-star two">✧</i>
          </div>
          <h2>{draft.name}</h2>
          <p className="adm-teacher-bubble">{draft.phrases.intro}</p>
          <div className="adm-emotion-tabs">
            {emotions.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={selected === value ? 'active' : ''}
                onClick={() => setSelected(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="adm-panel adm-editor-form">
          <div className="adm-editor-title">
            <h2>Характер и реплики</h2>
            <Sparkles size={20} />
          </div>
          <Field label="Имя персонажа">
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <div className="adm-form-stack">
            {Object.entries(labels).map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea
                  required
                  rows={2}
                  maxLength={1000}
                  value={draft.phrases[key as keyof Teacher['phrases']]}
                  onChange={(e) =>
                    setDraft({ ...draft, phrases: { ...draft.phrases, [key]: e.target.value } })
                  }
                />
              </Field>
            ))}
          </div>
        </section>
      </div>
      <section className="adm-panel adm-emotions-panel">
        <div className="adm-panel-title">
          <div>
            <h2>Пять настроений</h2>
            <p>Заменяйте изображения отдельно. Изменения применятся после сохранения.</p>
          </div>
          <span className="adm-badge">PNG · JPEG · WebP</span>
        </div>
        <div className="adm-emotion-grid">
          {emotions.map(([value, label]) => (
            <div className="adm-emotion-card" key={value}>
              <div className="adm-emotion-image">
                {draft.images[value] ? (
                  <img src={draft.images[value]} alt={label} />
                ) : (
                  <ImagePlus size={32} />
                )}
              </div>
              <strong>{label}</strong>
              <ImageUpload
                label="Заменить"
                notify={notify}
                onUpload={(url) =>
                  setDraft((current) =>
                    current ? { ...current, images: { ...current.images, [value]: url } } : current,
                  )
                }
              />
            </div>
          ))}
        </div>
        <div className="adm-editor-actions">
          <button className="adm-btn primary" disabled={busy}>
            <Save size={17} />
            {busy ? 'Сохраняем…' : 'Сохранить персонажа'}
          </button>
          <small>Файлы до 2 МБ. Для прозрачного фона используйте PNG или WebP.</small>
        </div>
      </section>
    </form>
  );
}

function CategoriesEditor({ notify }: { notify: Notify }) {
  const resource = useResource<Category[]>('/admin/categories');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/categories', request('POST', { name: name.trim() }));
      setName('');
      resource.reload();
      notify('Категория добавлена.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/admin/categories/${deleting.id}`, request('DELETE'));
      setDeleting(null);
      resource.reload();
      notify('Категория удалена.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="adm-two-columns">
        <section className="adm-panel">
          <div className="adm-panel-title">
            <h2>Категории библиотеки</h2>
            <span>{resource.data?.length ?? 0}</span>
          </div>
          {resource.loading ? (
            <Loader />
          ) : resource.error ? (
            <ErrorBox error={resource.error} retry={resource.reload} />
          ) : (
            resource.data?.map((category) => (
              <div className="adm-category-row" key={category.id}>
                <span className="adm-item-icon">
                  <BookOpen size={18} />
                </span>
                <div>
                  <strong>{category.name}</strong>
                  <small>ID: {category.id}</small>
                </div>
                <button
                  className="adm-icon-btn danger-ghost"
                  aria-label={`Удалить категорию ${category.name}`}
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          )}
          {!resource.loading && !resource.data?.length && (
            <Empty title="Добавьте первую категорию" text="Категории объединяют близкие темы." />
          )}
        </section>
        <form className="adm-panel adm-editor-form" onSubmit={add}>
          <div className="adm-editor-title">
            <h2>Новая категория</h2>
            <Plus size={20} />
          </div>
          <Field label="Название">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="Например, пунктуация"
            />
          </Field>
          <button className="adm-btn primary" disabled={busy}>
            <Plus size={16} />
            Добавить категорию
          </button>
          <p className="adm-muted">
            Категорию с материалами нельзя удалить. Сначала перенесите правила в другую категорию.
          </p>
        </form>
      </div>
      {deleting && (
        <Confirm
          title="Удалить категорию?"
          text={`Категория «${deleting.name}» будет удалена, если в ней нет правил.`}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, '');
  const separator = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n')).includes(';')
    ? ';'
    : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === separator && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('CSV: незакрытая кавычка.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift()?.map((s) => s.trim());
  if (!header?.length) throw new Error('CSV пуст.');
  return rows
    .filter((r) => r.some(Boolean))
    .map((r, i) => {
      if (r.length !== header.length)
        throw new Error(`CSV: количество колонок в строке ${i + 2} не совпадает с заголовком.`);
      return Object.fromEntries(header.map((key, index) => [key, r[index]]));
    });
}
function ImportEditor({ notify }: { notify: Notify }) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState('json');
  const [entity, setEntity] = useState('rules');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  function invalidate() {
    setPreview(null);
    setPayload(null);
  }
  function parse() {
    if (format === 'json') return JSON.parse(text);
    const rows = parseCsv(text);
    return {
      [entity]: rows.map((row) => ({
        ...row,
        ...(row.id ? {} : { id: undefined }),
        published: ['true', '1', 'да'].includes((row.published ?? '').toLowerCase()),
        difficulty: Number(row.difficulty || 1),
        ...(row.examNumber ? { examNumber: Number(row.examNumber) } : {}),
        ...Object.fromEntries(
          ['examples', 'mistakes', 'images', 'games', 'options']
            .filter((key) => key in row)
            .map((key) => [
              key,
              row[key]
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean),
            ]),
        ),
      })),
    };
  }
  async function validate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    invalidate();
    try {
      const value = parse();
      const result = await api<Preview>('/admin/import/preview', request('POST', value));
      setPayload(value);
      setPreview(result);
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview?.valid || !payload) return;
    setBusy(true);
    try {
      await api('/admin/import', request('POST', payload));
      notify('Материалы импортированы.');
      setPreview(null);
      setPayload(null);
      setText('');
      setFileName('');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  function downloadExample() {
    const sample =
      format === 'json'
        ? JSON.stringify(
            {
              rules: [
                {
                  title: 'Название нового правила',
                  categoryId: 'ВСТАВЬТЕ_ID_КАТЕГОРИИ',
                  subcategory: '',
                  summary: 'Краткое объяснение',
                  explanation: 'Полное объяснение',
                  examples: ['Первый пример'],
                  mistakes: [],
                  images: [],
                  difficulty: 1,
                  games: ['spy'],
                  published: false,
                },
              ],
              exercises: [],
            },
            null,
            2,
          )
        : entity === 'rules'
          ? 'title,categoryId,subcategory,summary,explanation,examples,mistakes,images,difficulty,games,published\nНазвание правила,ВСТАВЬТЕ_ID_КАТЕГОРИИ,,Краткое объяснение,Полное объяснение,Пример 1|Пример 2,,,1,spy,false\n'
          : 'ruleId,type,prompt,options,answer,explanation,difficulty,published\nВСТАВЬТЕ_ID_ПРАВИЛА,letter,Условие задания,Е|И,Е,Объяснение ответа,1,false\n';
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + sample], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `royale-import-example.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="adm-two-columns">
      <form className="adm-panel adm-editor-form" onSubmit={validate}>
        <div className="adm-editor-title">
          <h2>Импорт материалов</h2>
          <FileJson size={21} />
        </div>
        <div className="adm-form-grid">
          <Field label="Формат файла">
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                invalidate();
              }}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </Field>
          {format === 'csv' && (
            <Field label="Что импортируем">
              <select
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value);
                  invalidate();
                }}
              >
                <option value="rules">Правила</option>
                <option value="exercises">Задания</option>
              </select>
            </Field>
          )}
        </div>
        <label className="adm-import-drop">
          <Upload size={26} />
          <strong>Выбрать файл {format.toUpperCase()}</strong>
          <small>{fileName || 'До 2 МБ. Также можно вставить текст ниже.'}</small>
          <input
            type="file"
            accept={format === 'json' ? '.json,application/json' : '.csv,text/csv'}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                notify('Файл должен быть меньше 2 МБ.', true);
                return;
              }
              try {
                setText((await file.text()).replace(/^\uFEFF/, ''));
                setFileName(file.name);
                invalidate();
              } catch (e) {
                notify(messageOf(e), true);
              }
            }}
          />
        </label>
        <Field label="Содержимое файла">
          <textarea
            className="adm-code-input"
            rows={13}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              invalidate();
            }}
            placeholder={
              format === 'json' ? '{ "rules": [], "exercises": [] }' : 'title,categoryId,summary,explanation…'
            }
            required
            spellCheck={false}
          />
        </Field>
        <div className="adm-editor-actions">
          <button className="adm-btn primary" disabled={busy || !text.trim()}>
            <Check size={17} />
            {busy ? 'Проверяем…' : 'Проверить данные'}
          </button>
          <button className="adm-btn" type="button" onClick={downloadExample}>
            <Download size={16} />
            Шаблон
          </button>
        </div>
      </form>
      <div>
        <section className="adm-panel adm-import-help">
          <span className="adm-eyebrow">СНАЧАЛА ПРОВЕРКА</span>
          <h2>Никаких случайных публикаций.</h2>
          <p>
            Проверка не меняет базу. После неё вы увидите количество материалов и ошибки; сохранение
            запускается отдельной кнопкой.
          </p>
          <ol>
            <li>Скачайте шаблон и заполните его.</li>
            <li>
              Скопируйте ID существующей категории из раздела «Категории». Для заданий нужен ID правила.
            </li>
            <li>
              Оставьте <code>published: false</code>, чтобы импортировать черновики.
            </li>
            <li>Проверьте данные и подтвердите импорт.</li>
          </ol>
          <p>
            CSV: разделитель — запятая или точка с запятой; элементы списков разделяются <code>|</code>. JSON:
            объект с массивами <code>rules</code> и <code>exercises</code>.
          </p>
        </section>
        {preview && (
          <section className={`adm-panel adm-import-result ${preview.valid ? 'valid' : 'invalid'}`}>
            <h2>{preview.valid ? 'Можно импортировать' : 'Нужно исправить'}</h2>
            <div className="adm-import-counts">
              <span>
                <strong>{preview.counts?.rules ?? 0}</strong> правил
              </span>
              <span>
                <strong>{preview.counts?.exercises ?? 0}</strong> заданий
              </span>
            </div>
            {preview.errors?.length > 0 && (
              <ul>
                {preview.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            )}
            {preview.valid && (
              <button type="button" className="adm-btn primary" disabled={busy} onClick={() => void commit()}>
                <Upload size={16} />
                {busy ? 'Импортируем…' : 'Импортировать в базу'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function UsersEditor({ selfId, notify }: { selfId: string; notify: Notify }) {
  const resource = useResource<AdminUser[]>('/admin/users');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [pending, setPending] = useState<{ user: AdminUser; role: Role } | null>(null);
  async function save() {
    if (!pending) return;
    setBusyId(pending.user.id);
    try {
      await api(`/admin/users/${pending.user.id}`, request('PATCH', { role: pending.role }));
      setPending(null);
      resource.reload();
      notify('Роль пользователя обновлена.');
    } catch (e) {
      notify(messageOf(e), true);
    } finally {
      setBusyId('');
    }
  }
  const filtered = useMemo(
    () =>
      resource.data?.filter((u) => `${u.username} ${u.email}`.toLowerCase().includes(query.toLowerCase())) ??
      [],
    [resource.data, query],
  );
  return (
    <>
      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={17} />
          <input
            aria-label="Поиск пользователей"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Имя или электронная почта"
          />
        </div>
        <button className="adm-btn" onClick={resource.reload}>
          Обновить
        </button>
      </div>
      <section className="adm-panel adm-table-panel">
        {resource.loading ? (
          <Loader />
        ) : resource.error ? (
          <ErrorBox error={resource.error} retry={resource.reload} />
        ) : (
          <div className="adm-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Роль</th>
                  <th>Опыт</th>
                  <th>Регистрация</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="adm-user-cell">
                        <span className="adm-avatar">{u.username.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <strong>
                            {u.username}
                            {u.id === selfId && <span className="adm-self">вы</span>}
                          </strong>
                          <small>{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`Роль ${u.username}`}
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => setPending({ user: u, role: e.target.value as Role })}
                      >
                        {roles.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{u.xp} XP</td>
                    <td>{dateLabel(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <Empty title="Пользователи не найдены" text="Измените поисковый запрос." />}
          </div>
        )}
      </section>
      {pending && (
        <div className="adm-overlay">
          <section
            className="adm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="adm-role-title"
          >
            <Shield className="adm-violet" />
            <h2 id="adm-role-title">Изменить роль?</h2>
            <p>
              Пользователь <strong>{pending.user.username}</strong> получит роль «
              {roles.find(([role]) => role === pending.role)?.[1]}».
            </p>
            {pending.user.id === selfId && pending.role !== 'admin' && (
              <div className="adm-info">
                Вы меняете собственную роль и можете потерять доступ к управлению пользователями.
              </div>
            )}
            <div className="adm-actions">
              <button className="adm-btn" onClick={() => setPending(null)} disabled={!!busyId}>
                Отмена
              </button>
              <button className="adm-btn primary" onClick={() => void save()} disabled={!!busyId}>
                {busyId ? 'Сохраняем…' : 'Изменить роль'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ServersEditor({notify}:{notify:Notify}){const resource=useResource<AdminServer[]>('/admin/servers');const [names,setNames]=useState<Record<string,string>>({}),[busy,setBusy]=useState('');async function save(id:string,name:string){setBusy(id);try{await api('/admin/servers/'+id,request('PATCH',{name}));await resource.reload();notify('Название сохранено.');}catch(e){notify(messageOf(e),true);}finally{setBusy('');}}return <section className="adm-panel"><h2>Общие серверы игр</h2><p>Название может изменить только администратор.</p>{resource.data?.map(s=><div className="adm-server-row" key={s.id}><label>{s.description}<input aria-label={'Название '+s.name} maxLength={80} value={names[s.id]??s.name} onChange={e=>setNames({...names,[s.id]:e.target.value})}/></label><button className="adm-btn" disabled={!!busy||!(names[s.id]??s.name).trim()} onClick={()=>void save(s.id,names[s.id]??s.name)}>Сохранить</button></div>)}</section>;}

function AuditLog() {
  const resource = useResource<Audit[]>('/admin/audit');
  return (
    <>
      <div className="adm-toolbar">
        <span className="adm-toolbar-note">
          <Shield size={18} />
          Последние административные действия
        </span>
        <button className="adm-btn" onClick={resource.reload}>
          Обновить
        </button>
      </div>
      <section className="adm-panel adm-table-panel">
        {resource.loading ? (
          <Loader />
        ) : resource.error ? (
          <ErrorBox error={resource.error} retry={resource.reload} />
        ) : resource.data?.length ? (
          <div className="adm-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Действие</th>
                  <th>ID объекта</th>
                  <th>ID редактора</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((entry) => (
                  <tr key={entry.id}>
                    <td>{dateLabel(entry.createdAt)}</td>
                    <td>
                      <span className="adm-audit-action">{entry.action}</span>
                    </td>
                    <td>
                      <code>{entry.targetId || '—'}</code>
                    </td>
                    <td>
                      <code>{entry.actorId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Пока без изменений"
            text="Административные действия будут появляться здесь автоматически."
          />
        )}
      </section>
    </>
  );
}
