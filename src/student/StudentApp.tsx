import { SocialPage } from './SocialPage';
import { RemainingGamesPage } from '../games/RemainingGamesPage';
import { CheckpointPage } from '../games/CheckpointPage';
import { DurakPage } from '../games/DurakPage';
import { RoyaleWorld } from './RoyaleHero';
import { GameRooms } from '../games/GameRooms';
import { Arcade } from './Arcade';
import { MemoryGame } from './MemoryGame';
import { useEffect, useState, type FormEvent } from 'react';
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Crown,
  Flame,
  Gamepad2,
  GraduationCap,
  History,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  WifiOff,
  X,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth, useLive } from '../api';
import { Avatar, ConnectionContext, ErrorNotice, go, Loading, message, SpyArt, useResource } from './common';
import { Dashboard, Games, HistoryPage, Leaderboard, ProfilePage, SettingsPage, Roadmap } from './dashboard';
import { Lessons, LessonPlayer, Rules, RuleDetail } from './learning';
import { Servers, ServerDetail, Invitation } from './community';
import { RoomPage } from './room';
import '../student.css';
import '../royale-refresh.css';
import '../royale-world.css';

const nav = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'games', label: 'Игры', icon: Gamepad2 },
  { id: 'friends', label: 'Друзья и серии', icon: Flame },
  { id: 'servers', label: 'Серверы игр', icon: Users },
  { id: 'lessons', label: 'Уроки', icon: GraduationCap },
  { id: 'rules', label: 'Справочник правил', icon: BookOpen },
  { id: 'history', label: 'Моя активность', icon: History },
  { id: 'leaderboard', label: 'Рейтинг', icon: Trophy },
];
function readRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash) return hash;
  const invite = window.location.pathname.match(/^\/invite\/([^/]+)$/);
  return invite ? `invite/${invite[1]}` : 'home';
}
export default function StudentApp() {
  const auth = useAuth(),
    [route, setRoute] = useState(readRoute),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const social = useResource<{ me: { streak: number } }>(auth.user ? '/social/me' : null, true);
  const { connected } = useLive(() => window.dispatchEvent(new Event('rr-live')));
  useEffect(() => {
    const change = () => {
      setRoute(readRoute());
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  useEffect(() => {
    const reduced = localStorage.getItem('rr-reduce-motion') === 'true';
    document.documentElement.dataset.reduceMotion = String(reduced);
  }, []);
  const [page, id] = route.split('/');
  const user = auth.user;
  let content;
  if (auth.loading) content = <Loading />;
  else if (page === 'invite') content = <Invitation token={id ?? ''} />;
  else if (!user) content = <Welcome />;
  else if (page === 'home') content = <Dashboard />;
  else if (page === 'arcade')
    content = id === 'memory' ? <MemoryGame /> : <Arcade key={id} mode={id || 'practice'} />;
  else if (page === 'games')
    content =
      id === 'alias' || id === 'whoami' || id === 'impostor' ? (
        <RemainingGamesPage key={route} game={id} roomId={route.split('/')[2]} />
      ) : id === 'mafia' || id === 'bunker' || id === 'broken-text' ? (
        <CheckpointPage key={route} game={id} roomId={route.split('/')[2]} />
      ) : id === 'durak' ? (
        <DurakPage key={route} roomId={route.split('/')[2]} />
      ) : id === 'jeopardy' || id === 'roulette' ? (
        <GameRooms game={id} roomId={route.split('/')[2]} />
      ) : (
        <Games />
      );
  else if (page === 'servers') content = id ? <ServerDetail id={id} /> : <Servers />;
  else if (page === 'rooms') content = <RoomPage key={id} id={id ?? ''} />;
  else if (page === 'lessons') content = id ? <LessonPlayer key={id} id={id} /> : <Lessons />;
  else if (page === 'rules') content = id ? <RuleDetail key={id} id={id} /> : <Rules />;
  else if (page === 'profile' || page === 'friends') content = <SocialPage key={id || 'me'} id={id} />;
  else if (page === 'history') content = <HistoryPage />;
  else if (page === 'leaderboard') content = <Leaderboard />;
  else if (page === 'settings') content = <SettingsPage />;
  else content = <Roadmap section={page} />;
  return (
    <ConnectionContext.Provider value={connected}>
      <div className="rr-app">
        {menu && (
          <button className="rr-mobile-scrim" aria-label="Закрыть меню" onClick={() => setMenu(false)} />
        )}
        <aside className={`rr-sidebar ${menu ? 'open' : ''}`}>
          <a href="#home" className="rr-brand" aria-label="Русский Royale — главная">
            <span className="rr-brand-icon">
              <Crown size={25} strokeWidth={2.5} />
            </span>
            <span>
              РУССКИЙ<strong>ROYALE</strong>
            </span>
          </a>
          <button
            className="rr-sidebar-close rr-icon-button"
            aria-label="Закрыть меню"
            onClick={() => setMenu(false)}
          >
            <X />
          </button>
          <div className="rr-sidebar-section-label">ТВОЁ ПРОСТРАНСТВО</div>
          <nav aria-label="Основная навигация">
            {nav.map((item, i) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`rr-nav-item ${page === item.id || (page === 'rooms' && item.id === 'servers') ? 'active' : ''}`}
              >
                <item.icon size={19} />
                <span>
                  {item.label}
                  {item.id === 'friends' && social.data?.me && <span> 🔥 {social.data.me.streak}</span>}
                </span>
                {item.id === 'games' && <span className="rr-nav-count">8</span>}
                {i === 2 && <span className="rr-nav-dot" />}
              </a>
            ))}
          </nav>
          <div className="rr-sidebar-section-label secondary-label">НА ПЕРСПЕКТИВУ</div>
          <nav aria-label="План развития">
            <a className={`rr-nav-item ${page === 'ege' ? 'active' : ''}`} href="#ege">
              <Sparkles size={19} />
              <span>Подготовка к ЕГЭ</span>
              <span className="rr-soon-dot" />
            </a>
            <a className={`rr-nav-item ${page === 'friends' ? 'active' : ''}`} href="#friends">
              <Users size={19} />
              <span>Друзья</span>
              <span className="rr-soon-dot" />
            </a>
          </nav>
          <div className="rr-sidebar-bottom">
            <div className="rr-sidebar-tip">
              <div className="rr-tip-icon">
                <Flame size={21} />
              </div>
              <strong>Знания — твоя суперсила</strong>
              <p>Играй, разбирайся в правилах и становись увереннее.</p>
              <a href="#lessons">
                Открыть уроки <ArrowRight size={14} />
              </a>
            </div>
            <a className={`rr-nav-item ${page === 'settings' ? 'active' : ''}`} href="#settings">
              <Settings size={19} />
              <span>Настройки</span>
            </a>
            <a className="rr-nav-item" href="/admin.html">
              <ShieldCheck size={19} />
              <span>Администраторам</span>
            </a>
            <span className="rr-build-label">ТЕСТОВАЯ ВЕРСИЯ · ЭТАПЫ 1–3</span>
          </div>
        </aside>
        <div className="rr-workspace">
          <header className="rr-topbar">
            <button
              className="rr-icon-button rr-menu-button"
              aria-label="Открыть меню"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <div className="rr-breadcrumb">
              Твоё пространство <ChevronRight size={14} />{' '}
              <strong>
                {nav.find((n) => n.id === page)?.label ??
                  (page === 'rooms'
                    ? 'Игровая комната'
                    : page === 'profile'
                      ? 'Личный кабинет'
                      : page === 'settings'
                        ? 'Настройки'
                        : page === 'invite'
                          ? 'Приглашение'
                          : page === 'arcade'
                            ? 'Игровая аркада'
                            : 'Скоро на платформе')}
              </strong>
            </div>
            <div className="rr-topbar-right">
              <span className="rr-beta-badge">
                <span /> MVP
              </span>
              {user ? (
                <>
                  <button className="rr-xp-badge" onClick={() => go('profile')}>
                    <Sparkles size={15} />
                    {user.xp} XP
                  </button>
                  <button className="rr-account" onClick={() => go('profile')}>
                    <Avatar name={user.username} url={user.avatar} />
                    <span>
                      {user.username}
                      <small>Уровень {Math.floor(user.xp / 100) + 1}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </>
              ) : (
                <span className="rr-guest-label">Играй. Учись. Побеждай.</span>
              )}
            </div>
          </header>
          {!online && (
            <div className="rr-offline">
              <WifiOff size={16} /> Нет подключения. Игра хранится на сервере; после подключения состояние
              восстановится.
            </div>
          )}
          <main className={`rr-main ${page === 'rooms' ? 'rr-main-room' : ''}`}>{content}</main>
          <footer className="rr-footer">
            <span>
              Русский Royale <span>·</span> Учиться интереснее вместе
            </span>
            <a href="#roadmap">
              Что уже работает <CircleHelp size={13} />
            </a>
          </footer>
        </div>
      </div>
    </ConnectionContext.Provider>
  );
}

export function AuthForm({ onSuccess }: { onSuccess?: () => void }) {
  const auth = useAuth(),
    [mode, setMode] = useState<'login' | 'register'>('register'),
    [username, setUsername] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await auth.login(email, password);
      else await auth.register(email, password, username);
      onSuccess?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="rr-auth-form" onSubmit={submit}>
      <div className="rr-auth-tabs">
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => {
            setMode('register');
            setError('');
          }}
        >
          Регистрация
        </button>
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => {
            setMode('login');
            setError('');
          }}
        >
          Вход
        </button>
      </div>
      <h2>{mode === 'register' ? 'Твоя история начинается здесь' : 'Рады снова видеть тебя'}</h2>
      <p>
        {mode === 'register'
          ? 'Создай аккаунт и собери свою команду.'
          : 'Продолжим с того места, где остановились.'}
      </p>
      {mode === 'register' && (
        <label>
          Имя игрока
          <input
            name="username"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={32}
            placeholder="Как тебя называть?"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
      )}
      <label>
        Электронная почта
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Пароль
        <div className="rr-password-field">
          <input
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'register' ? 10 : 1}
            maxLength={128}
            placeholder={mode === 'register' ? 'Не менее 10 символов' : 'Твой пароль'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>
      <ErrorNotice text={error} />
      <button disabled={busy} className="rr-button primary full">
        {busy ? 'Подключаемся…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}
        <ArrowRight size={17} />
      </button>
      <small className="rr-auth-note">
        Личные данные доступны только твоему аккаунту и администраторам платформы.
      </small>
    </form>
  );
}
function Welcome() {
  return (
    <div className="rr-welcome rr-world-welcome">
      <div className="rr-welcome-intro">
        <span className="rr-pill purple">
          <Sparkles size={14} /> Русский язык. Новый уровень.
        </span>
        <h1>
          Здесь знания
          <br />
          решают <span>исход игры.</span>
        </h1>
        <p>
          Раскрывай карточки, проходи испытания и вычисляй шпиона вместе с друзьями. Подготовка, в которую
          хочется вернуться.
        </p>
        <RoyaleWorld eager />
        <div className="rr-welcome-facts">
          <div>
            <Users size={20} />
            <strong>До 30 игроков</strong>
            <span>В одной комнате</span>
          </div>
          <div>
            <GraduationCap size={20} />
            <strong>Живые уроки</strong>
            <span>Практика с объяснениями</span>
          </div>
          <div>
            <ShieldCheck size={20} />
            <strong>Честная игра</strong>
            <span>Секретные роли на сервере</span>
          </div>
        </div>
      </div>
      <AuthForm />
    </div>
  );
}
