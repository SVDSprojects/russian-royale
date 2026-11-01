import { PreferenceSettings } from './preferences';
import { RoyaleHero } from './RoyaleHero';
import { WaitingGames } from './WaitingGames';
import { GameArt } from './GameArt';
import { ArcadeCards, arcadeModes } from './Arcade';
import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Flame,
  Gamepad2,
  GraduationCap,
  History,
  Layers3,
  LogOut,
  Medal,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
  Eye,
  Moon,
  HelpCircle,
  Grid2X2,
  Type,
  Spade,
} from 'lucide-react';
import { api, useAuth } from '../api';
import {
  ArrowLink,
  Avatar,
  DateText,
  Empty,
  ErrorNotice,
  go,
  json,
  Loading,
  message,
  Notice,
  PageHeader,
  SpyArt,
  useResource,
} from './common';
import {
  gameModes,
  type Lesson,
  type Profile,
  type Progress,
  type Rule,
  type Server,
  type Teacher,
  type User,
} from './models';

export function Dashboard() {
  const { user } = useAuth();
  const profile = useResource<Profile>('/profile', true),
    progress = useResource<Progress>('/progress', true),
    lessons = useResource<Lesson[]>('/lessons', true),
    servers = useResource<Server[]>('/servers', true),
    teacher = useResource<Teacher>('/teacher', true);
  const xp = user?.xp ?? 0;
  const nextLesson = lessons.data?.find((lesson) => !progress.data?.completedLessons.includes(lesson.id));
  const allLearned = !!lessons.data?.length && !!progress.data && !nextLesson;
  const featuredLesson = nextLesson || lessons.data?.[0];
  return (
    <div className="rr-discovery">
      <PageHeader
        eyebrow="ИГРАЙ. УЧИСЬ. ПОБЕЖДАЙ."
        title="Твой следующий уровень"
        description={`Привет, ${user?.username}! Сегодня отличный день, чтобы стать сильнее.`}
        action={
          <div className="rr-date-chip">
            <span className="rr-live-dot" />
            Твоё игровое пространство
          </div>
        }
      />
      <WaitingGames />
      <RoyaleHero />
      <div className="rr-stats-grid">
        <Stat icon={<Zap />} value={`${xp} XP`} title="Твой опыт" color="purple" />
        <Stat
          icon={<Trophy />}
          value={String(profile.data?.stats.wins ?? 0)}
          title="Побед в играх"
          color="amber"
        />
        <Stat
          icon={<BookOpen />}
          value={String(profile.data?.stats.lessons ?? 0)}
          title="Уроков пройдено"
          color="teal"
        />
        <Stat
          icon={<Users />}
          value={String(servers.data?.length ?? 0)}
          title="Твоих серверов"
          color="pink"
        />
      </div>
      <ErrorNotice
        text={profile.error || progress.error || lessons.error || servers.error || teacher.error}
      />
      <div className="rr-section-heading rr-game-heading">
        <div>
          <span className="rr-eyebrow">СОБИРАЕМСЯ ВМЕСТЕ</span>
          <h2>Вечер с друзьями</h2>
        </div>
        <ArrowLink to="games">Все режимы</ArrowLink>
      </div>
      <div className="rr-game-grid dashboard">
        {gameModes
          .filter((g) => g.available)
          .map((g) => (
            <GameCard key={g.name} game={g} />
          ))}
      </div>
      <div className="rr-section-heading royale-solo-heading">
        <div>
          <span className="rr-eyebrow">ПЯТЬ СПОСОБОВ СТАТЬ СИЛЬНЕЕ</span>
          <h2>Твой личный рекорд</h2>
        </div>
        <span className="royale-section-note">Один игрок. Много открытий.</span>
      </div>
      <ArcadeCards />
      <div className="rr-dashboard-columns">
        <section>
          <div className="rr-section-heading">
            <div>
              <span className="rr-eyebrow">ПОКА ДРУЗЬЯ СОБИРАЮТСЯ</span>
              <h2>Прокачай свои знания</h2>
            </div>
            <ArrowLink to="lessons">Все уроки</ArrowLink>
          </div>
          <div className="rr-lesson-feature">
            <div className="rr-lesson-character">
              <span className="rr-character-spark">✦</span>
              <img
                src={teacher.data?.images.explaining ?? '/assets/teacher-explaining.png'}
                alt={teacher.data?.name ?? 'Пиксельная учительница'}
                loading="lazy"
              />
            </div>
            <div className="rr-lesson-feature-text">
              <span className="rr-pill teal">
                <GraduationCap size={13} /> ИНТЕРАКТИВНЫЙ УРОК
              </span>
              <h3>
                {allLearned ? 'Все уроки пройдены!' : (featuredLesson?.title ?? 'Уроки появятся здесь')}
              </h3>
              <p>
                {lessons.data?.length
                  ? allLearned
                    ? 'Закрепи знания в тренировке или повтори любимую тему.'
                    : 'Следующий непройденный урок: объяснение, примеры и практика.'
                  : 'Редактор может добавить первый урок в административной панели.'}
              </p>
              {featuredLesson && (
                <button
                  className="rr-button secondary"
                  onClick={() => go(allLearned ? 'arcade/practice' : `lessons/${featuredLesson.id}`)}
                >
                  {allLearned ? 'Закрепить знания' : 'Начать урок'}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
          </div>
        </section>
        <section className="rr-level-card">
          <span className="rr-eyebrow">ТВОЙ ПРОГРЕСС</span>
          <div className="rr-level-heading">
            <div className="rr-level-emblem">
              <Crown />
            </div>
            <div>
              <h3>Уровень {Math.floor(xp / 100) + 1}</h3>
              <p>Каждый шаг имеет значение</p>
            </div>
          </div>
          <div className="rr-progress-label">
            <span>До следующего уровня</span>
            <strong>{xp % 100} / 100 XP</strong>
          </div>
          <div className="rr-progress-track">
            <span style={{ width: `${xp % 100}%` }} />
          </div>
          <p className="rr-level-note">
            Получай опыт за уроки, правильные ответы и настоящие игровые раунды.
          </p>
          <ArrowLink to="profile">Мой профиль</ArrowLink>
        </section>
      </div>
      <section className="rr-community-strip">
        <div className="rr-community-icon">
          <Users />
        </div>
        <div>
          <h3>Присоединяйся к игрокам</h3>
          <p>Выбери общий сервер игры и заходи в комнату.</p>
        </div>
        <button className="rr-button secondary" onClick={() => go('servers')}>
          <Plus size={17} /> Выбрать игру
        </button>
      </section>
    </div>
  );
}
function Stat({
  icon,
  value,
  title,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  title: string;
  color: string;
}) {
  return (
    <div className="rr-stat">
      <div className={`rr-stat-icon ${color}`}>{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{title}</span>
      </div>
    </div>
  );
}
function GameCard({ game }: { game: (typeof gameModes)[number] }) {
  return (
    <article className={`rr-game-card ${game.icon} ${game.available ? 'available' : 'upcoming'}`}>
      <div className="rr-game-card-art">
        <GameArt kind={game.icon} />
        {game.available ? (
          <span className="rr-game-status">
            <span /> Можно играть
          </span>
        ) : (
          <span className="rr-game-status muted">В разработке</span>
        )}
      </div>
      <div className="rr-game-card-body">
        <h3>{game.name}</h3>
        <p>{game.label}</p>
        <div className="rr-game-card-foot">
          <span>
            <Users size={13} />
            {game.players}
          </span>
          {game.available && (
            <button aria-label={`Играть в ${game.name}`} onClick={() => go(game.route || 'servers')}>
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
export function Games() {
  const [filter, setFilter] = useState('available'),
    [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const multiplayer = gameModes.filter(
    (g) =>
      (filter === 'upcoming' ? !g.available : g.available) &&
      `${g.name} ${g.label}`.toLowerCase().includes(query),
  );
  const showSolo = filter === 'available' || filter === 'solo';
  const soloCount = showSolo
    ? arcadeModes.filter((g) => `${g.name} ${g.description}`.toLowerCase().includes(query)).length
    : 0;
  const shownMultiplayer = filter === 'solo' ? [] : multiplayer;
  return (
    <div className="rr-discovery rr-catalog-discovery">
      <PageHeader
        eyebrow="ТВОЯ ИГРОВАЯ БИБЛИОТЕКА"
        title="Знания вступают в игру"
        description="Настоящие роли, общение и соревнование. Выбирай компанию — и начинаем."
      />
      <div className="rr-catalog-controls">
        <div className="rr-catalog-tabs" role="group" aria-label="Тип игр">
          {[
            ['available', 'Можно играть'],
            ['solo', 'Для одного'],
            ['friends', 'С друзьями'],
            ['upcoming', 'В разработке'],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="rr-search">
          <Search size={18} />
          <input
            aria-label="Поиск игр"
            placeholder="Название или настроение…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <p className="rr-catalog-caption" role="status">
        {filter === 'upcoming'
          ? 'Готовим новые игры. Они появятся здесь, когда будут готовы к настоящей партии.'
          : 'Выбирай доступный режим и начинай. Для одиночных тренировок не нужно собирать комнату.'}
      </p>
      <div className="rr-game-grid">
        {shownMultiplayer.map((game) => (
          <GameCard key={game.name} game={game} />
        ))}
      </div>
      {showSolo && soloCount > 0 && (
        <>
          <div className="rr-section-heading royale-solo-heading">
            <div>
              <span className="rr-eyebrow">В СВОЁМ ТЕМПЕ</span>
              <h2>Соло приключения</h2>
            </div>
          </div>
          <ArcadeCards search={query} />
        </>
      )}
      {!soloCount && !shownMultiplayer.length && (
        <Empty icon={<Search />} heading="Ничего не нашлось">
          Попробуй другое название или другую вкладку.
        </Empty>
      )}
      {filter !== 'solo' && filter !== 'upcoming' && !query && (
        <section className="rr-panel rr-how-to">
          <h2>Как сыграть первую партию</h2>
          <div className="rr-three-steps">
            {[
              { n: '01', title: 'Выбери игру', text: 'У каждой игры есть общий сервер.' },
              {
                n: '02',
                title: 'Позови друзей',
                text: 'Отправь ссылку-приглашение. Для «Шпиона» нужны трое, для новых игр — двое.',
              },
              { n: '03', title: 'Открой комнату', text: 'Все отмечают готовность, ведущий запускает раунд.' },
            ].map((s) => (
              <div key={s.n}>
                <span>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <button className="rr-button primary" onClick={() => go('servers')}>
            К моим серверам
            <ArrowRight size={17} />
          </button>
        </section>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user, refresh, logout } = useAuth(),
    profile = useResource<Profile>('/profile', true),
    [name, setName] = useState(user?.username ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/profile', json('PATCH', { username: name }));
      await refresh();
      setSaved(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="ТВОЯ ИСТОРИЯ"
        title="Личный кабинет"
        description="Победы, знания и всё, что делает тебя сильнее."
      />
      <div className="rr-profile-hero">
        <Avatar name={user?.username ?? ''} url={user?.avatar} size="large" />
        <div>
          <span className="rr-pill purple">УРОВЕНЬ {Math.floor((user?.xp ?? 0) / 100) + 1}</span>
          <h2>{user?.username}</h2>
          <p>{user?.email}</p>
          <span className="rr-profile-id">ID: {user?.id}</span>
        </div>
        <div className="rr-profile-xp">
          <Sparkles />
          <strong>{user?.xp ?? 0}</strong>
          <span>опыта заработано</span>
        </div>
      </div>
      <div className="rr-stats-grid">
        <Stat
          icon={<Gamepad2 />}
          value={String(profile.data?.stats.games ?? 0)}
          title="Завершённых игр"
          color="purple"
        />
        <Stat icon={<Trophy />} value={String(profile.data?.stats.wins ?? 0)} title="Побед" color="amber" />
        <Stat
          icon={<Shield />}
          value={String(profile.data?.stats.losses ?? 0)}
          title="Поражений"
          color="pink"
        />
        <Stat
          icon={<GraduationCap />}
          value={String(profile.data?.stats.lessons ?? 0)}
          title="Пройдено уроков"
          color="teal"
        />
      </div>
      <div className="rr-dashboard-columns">
        <form className="rr-panel rr-form" onSubmit={save}>
          <h2>Как тебя видят другие</h2>
          <label>
            Имя игрока
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              minLength={2}
              maxLength={32}
              required
              autoComplete="nickname"
            />
          </label>
          <ErrorNotice text={error} />
          {saved && (
            <div className="rr-success">
              <Check size={16} /> Изменения сохранены
            </div>
          )}
          <button className="rr-button primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
        </form>
        <div className="rr-panel">
          <h2>Твой аккаунт</h2>
          <p className="rr-muted">
            История и игровой опыт хранятся на сервере и доступны после входа с другого устройства.
          </p>
          <div className="rr-divider" />
          <button className="rr-button secondary" onClick={() => go('history')}>
            <History size={17} /> Открыть историю
          </button>
          <button
            className="rr-button ghost rr-top-gap"
            onClick={() => {
              void logout().catch((e) => setError(message(e)));
            }}
          >
            <LogOut size={17} /> Выйти из аккаунта
          </button>
        </div>
      </div>
      <ErrorNotice text={profile.error} />
    </>
  );
}
export function HistoryPage() {
  const profile = useResource<Profile>('/profile', true),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState('');
  const history = profile.data?.history ?? [];
  const items = history.filter((h) => {
    const type = String(h.type ?? h.kind ?? 'game');
    return (
      (filter === 'all' || type.includes(filter)) &&
      JSON.stringify(h).toLowerCase().includes(query.toLowerCase())
    );
  });
  return (
    <>
      <PageHeader
        eyebrow="КАЖДЫЙ ШАГ ИМЕЕТ ЗНАЧЕНИЕ"
        title="Моя активность"
        description="Завершённые игры, занятия и ответы. История сохраняется даже после изменения учебных материалов."
      />
      <div className="rr-toolbar">
        <div className="rr-search">
          <Search size={18} />
          <input
            aria-label="Поиск по истории"
            placeholder="Поиск по теме…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select aria-label="Тип активности" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Вся активность</option>
          <option value="game">Игры</option>
          <option value="lesson">Уроки</option>
          <option value="exercise">Упражнения</option>
        </select>
      </div>
      <ErrorNotice text={profile.error} />
      {profile.loading ? (
        <Loading />
      ) : items.length ? (
        <div className="rr-history-list">
          {items.map((h, i) => {
            const type = String(h.type ?? h.kind ?? 'game');
            return (
              <article className="rr-history-item" key={String(h.id ?? i)}>
                <div className={`rr-stat-icon ${type.includes('game') ? 'purple' : 'teal'}`}>
                  {type.includes('game') ? <Gamepad2 /> : <BookOpen />}
                </div>
                <div>
                  <span className="rr-eyebrow">
                    {type.includes('game') ? 'ИГРА' : type.includes('lesson') ? 'УРОК' : 'УПРАЖНЕНИЕ'}
                  </span>
                  <h3>
                    {String(h.title ?? h.topicTitle ?? h.topic_title ?? h.prompt ?? 'Учебная активность')}
                  </h3>
                  <p>
                    <DateText value={h.createdAt ?? h.created_at} />
                    {h.win !== undefined
                      ? ` · ${h.win ? 'Победа' : 'Участие'}`
                      : h.correct !== undefined
                        ? ` · ${h.correct ? 'Верно' : 'Нужна практика'}`
                        : ''}
                  </p>
                </div>
                <span className="rr-history-xp">
                  {Number(h.xp ?? h.xpAwarded ?? 0) > 0 ? `+${h.xp ?? h.xpAwarded} XP` : ''}
                </span>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<History />}
          heading={history.length ? 'Ничего не найдено' : 'Первая история ещё впереди'}
          action={
            <button className="rr-button primary" onClick={() => go('lessons')}>
              Открыть уроки
              <ArrowRight size={16} />
            </button>
          }
        >
          {history.length
            ? 'Попробуй изменить фильтр.'
            : 'Пройди урок или заверши игру — результат появится здесь.'}
        </Empty>
      )}
    </>
  );
}
export function Leaderboard() {
  const { user } = useAuth(),
    board = useResource<User[]>('/leaderboard', true);
  return (
    <>
      <PageHeader
        eyebrow="ЗНАНИЯ В ЦИФРАХ"
        title="Рейтинг игроков"
        description="Настоящий опыт участников платформы. Очки за одно упражнение не начисляются бесконечно."
      />
      <ErrorNotice text={board.error} />
      {board.loading ? (
        <Loading />
      ) : board.data?.length ? (
        <div className="rr-leaderboard">
          {board.data.map((p, i) => (
            <div key={p.id} className={`rr-rank-row ${p.id === user?.id ? 'self' : ''}`}>
              <span className={`rr-rank ${i < 3 ? 'top' : ''}`}>{i < 3 ? <Medal size={25} /> : i + 1}</span>
              <Avatar name={p.username} url={p.avatar} />
              <div>
                <strong>
                  {p.username}
                  {p.id === user?.id && <small>Это ты</small>}
                </strong>
                <span>Уровень {Math.floor(p.xp / 100) + 1}</span>
              </div>
              <span className="rr-rank-xp">
                {p.xp} <small>XP</small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<Trophy />} heading="Рейтинг скоро оживёт">
          Зарабатывай опыт в уроках и играх.
        </Empty>
      )}
    </>
  );
}
export function SettingsPage() {
  const { logout } = useAuth(),
    [reduced, setReduced] = useState(localStorage.getItem('rr-reduce-motion') === 'true'),
    [error, setError] = useState('');
  return (
    <>
      <PageHeader eyebrow="ТВОЙ КОМФОРТ" title="Настройки" description="Настрой пространство под себя." />
      <PreferenceSettings />
      <section className="rr-panel rr-settings-panel">
        <div className="rr-setting-row">
          <div>
            <h3>Уменьшить анимацию</h3>
            <p>Спокойные переходы без движения и вспышек. Системная настройка также учитывается.</p>
          </div>
          <button
            className={`rr-toggle ${reduced ? 'checked' : ''}`}
            role="switch"
            aria-checked={reduced}
            aria-label="Уменьшить анимацию"
            onClick={() => {
              const value = !reduced;
              setReduced(value);
              localStorage.setItem('rr-reduce-motion', String(value));
              document.documentElement.dataset.reduceMotion = String(value);
            }}
          >
            <span />
          </button>
        </div>
        <div className="rr-setting-row">
          <div>
            <h3>Установка на телефон</h3>
            <p>
              В меню браузера выбери «Установить приложение» или «На экран Домой». Для установки нужен HTTPS.
              Игры и вход требуют интернета.
            </p>
          </div>
          <Layers3 className="rr-muted" />
        </div>
        <div className="rr-setting-row">
          <div>
            <h3>Безопасность аккаунта</h3>
            <p>Пароль хранится в виде защищённого хеша. Выход завершает текущую сессию.</p>
          </div>
          <button
            className="rr-button secondary"
            onClick={() => {
              void logout().catch((e) => setError(message(e)));
            }}
          >
            <LogOut size={17} /> Выйти
          </button>
        </div>
      </section>
      <ErrorNotice text={error} />
    </>
  );
}
export function Roadmap({ section }: { section: string }) {
  const heading =
    section === 'ege' ? 'Подготовка к ЕГЭ' : section === 'friends' ? 'Друзья' : 'Что уже работает';
  return (
    <>
      <PageHeader
        eyebrow="ОТКРЫТО О РАЗРАБОТКЕ"
        title={heading}
        description="Сейчас работает первая версия платформы: основа, учебная система и мультиплеерный «Шпион»."
      />
      <section className="rr-panel rr-roadmap">
        <span className="rr-pill teal">
          <CheckCircle2 size={15} /> ДОСТУПНО СЕЙЧАС
        </span>
        <h2>Всё для вашей первой партии</h2>
        <div className="rr-three-steps">
          <div>
            <ShieldCheck />
            <h3>Аккаунт и сообщество</h3>
            <p>Регистрация, профиль, закрытые серверы и приглашения по ссылке.</p>
            <ArrowLink to="servers">Серверы игр</ArrowLink>
          </div>
          <div>
            <GraduationCap />
            <h3>Уроки и справочник</h3>
            <p>Редактируемые правила, интерактивные упражнения, пиксельная учительница.</p>
            <ArrowLink to="lessons">Начать учиться</ArrowLink>
          </div>
          <div>
            <Gamepad2 />
            <h3>Настоящий «Шпион»</h3>
            <p>Секретные роли, обсуждение, голосование и сохранение результатов.</p>
            <ArrowLink to="games">К играм</ArrowLink>
          </div>
        </div>
        <div className="rr-divider" />
        <span className="rr-pill purple">СЛЕДУЮЩИЕ ЭТАПЫ</span>
        <h3>Ещё больше способов учиться</h3>
        <p className="rr-muted">
          Девять остальных игр, заявки в друзья, интервальное повторение, тренажёр ЕГЭ, пробные экзамены и
          расширенные достижения пока не реализованы. Друзей уже можно пригласить на сервер обычной ссылкой.
        </p>
        <Notice>
          Правила, примеры и задания можно менять через админку. Мемори и тренировочные забеги используют
          опубликованные материалы справочника.
        </Notice>
      </section>
    </>
  );
}
