import { useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Pencil,
  Gift,
  Users,
  Palette,
  Flame,
  ChartNoAxesCombined,
  Copy,
  Star,
  Heart,
  PawPrint,
  Diamond,
  Crown,
  Flower2,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import { Avatar, Dialog, ErrorNotice, json, useResource, go } from './common';
import { GiftArt, PlayerName, type Appearance, type OwnedItem } from './Identity';
import { gifts } from '../../shared/collection';
import {
  defaultProfileStyle,
  profilePalettes,
  profilePatterns,
  type ProfileStyle,
} from '../../shared/profile-style';
import './profile.css';
export type ProfilePerson = {
  id: string;
  username: string;
  avatar: string;
  publicId: string;
  bio: string;
  birthday?: string;
  xp?: number;
  streak: number;
};
export type ProfileTab = 'gifts' | 'friends' | 'activity';
const patternNames = {
  none: 'Без узора',
  stars: 'Звёзды',
  hearts: 'Сердца',
  paws: 'Лапки',
  diamonds: 'Ромбы',
  crowns: 'Короны',
  flowers: 'Цветы',
  lightning: 'Молнии',
};
function background(style: ProfileStyle): CSSProperties {
  const value = (hex: string) => {
    const rgb = hex
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16));
    return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  };
  const light = (value(style.color) + value(style.accent)) / 2 > 160;
  return {
    '--profile-color': style.color,
    '--profile-accent': style.accent,
    '--profile-ink': light ? '#20213b' : '#fff',
    '--profile-soft': light ? '#20213b99' : '#ffffffa6',
    '--profile-button': light ? '#ffffff70' : '#14132630',
  } as CSSProperties;
}
function Pattern({ style }: { style: ProfileStyle }) {
  if (style.pattern === 'none') return null;
  const Icon = {
    stars: Star,
    hearts: Heart,
    paws: PawPrint,
    diamonds: Diamond,
    crowns: Crown,
    flowers: Flower2,
    lightning: Zap,
  }[style.pattern];
  return (
    <div className="profile-pattern" aria-hidden="true" style={{ opacity: style.intensity / 100 }}>
      {Array.from({ length: 30 }, (_, i) => (
        <Icon key={i} size={27} strokeWidth={1.3} />
      ))}
    </div>
  );
}
export function ProfileHero({
  person,
  appearance,
  own,
  onEdit,
  onTab,
  onFriend,
  busy,
}: {
  person: ProfilePerson;
  appearance: Appearance | null;
  own: boolean;
  onEdit: (tab: 'profile' | 'appearance') => void;
  onTab: (tab: ProfileTab) => void;
  onFriend: () => void;
  busy: boolean;
}) {
  const style = appearance?.style || defaultProfileStyle;
  const featured = appearance?.featured || [];
  return (
    <header className="profile-hero" style={background(style)}>
      <Pattern style={style} />
      <div className="profile-hero-top">
        <button aria-label="Назад" onClick={() => go(own ? 'home' : 'profile')}>
          <ArrowLeft size={22} />
        </button>
        {own && (
          <button aria-label="Редактировать профиль" onClick={() => onEdit('profile')}>
            <Pencil size={17} />
            <span>Изменить</span>
          </button>
        )}
      </div>
      <div className="profile-avatar-stage">
        <Avatar name={person.username} url={person.avatar} size="large" />
        {['orbit', 'both'].includes(style.giftLayout) &&
          featured.slice(0, 6).map((item, i) => (
            <span
              className={'profile-orbit-gift position-' + i}
              key={item.id}
              title={gifts.find((g) => g.key === item.reward)?.name}
            >
              <GiftArt itemKey={item.reward} small />
            </span>
          ))}
      </div>
      <h1 className="profile-display-name">
        <PlayerName id={person.id} name={person.username} />
      </h1>
      <p className="profile-hero-status">
        <Flame size={15} /> Серия {person.streak} дн. <span>·</span> {person.xp || 0} XP
      </p>
      <div className="profile-hero-actions">
        {own ? (
          <>
            <button onClick={() => onEdit('appearance')}>
              <Palette />
              <span>Оформление</span>
            </button>
            <button onClick={() => go('collection')}>
              <Gift />
              <span>Коллекции</span>
            </button>
            <button onClick={() => onTab('friends')}>
              <Users />
              <span>Мои друзья</span>
            </button>
            <button onClick={() => onTab('activity')}>
              <ChartNoAxesCombined />
              <span>Мой темп</span>
            </button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={onFriend}>
              <Users />
              <span>Добавить в друзья</span>
            </button>
            <button onClick={() => onTab('gifts')}>
              <Gift />
              <span>Смотреть подарки</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
export function ProfileInfo({ person }: { person: ProfilePerson }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="profile-info" aria-label="Информация о профиле">
      <div className="profile-info-row">
        <div>
          <span>ID игрока</span>
          <strong>{person.publicId}</strong>
        </div>
        <button
          aria-label="Скопировать ID"
          onClick={() =>
            void navigator.clipboard
              .writeText(person.publicId)
              .then(() => {
                setCopied(true);
                setError('');
              })
              .catch(() => setError('Не удалось скопировать ID.'))
          }
        >
          <Copy size={20} />
        </button>
      </div>
      {copied && <small role="status">ID скопирован</small>}
      {error && <small role="alert">{error}</small>}
      {person.birthday && (
        <div className="profile-info-row">
          <div>
            <span>День рождения</span>
            <p>
              {new Date(person.birthday + 'T12:00:00Z').toLocaleDateString('ru', {
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
        </div>
      )}
      {person.bio && (
        <div className="profile-info-row">
          <div>
            <span>О себе</span>
            <p>{person.bio}</p>
          </div>
        </div>
      )}
    </section>
  );
}
export function ProfileGifts({ items, own }: { items: OwnedItem[]; own: boolean }) {
  return (
    <section className="profile-gifts sdvs-showcase" aria-label="Подарки в профиле">
      {items.length ? (
        <div className="profile-gift-grid">
          {items.map((item) => (
            <article key={item.id}>
              <GiftArt itemKey={item.reward} small />
              <strong>{gifts.find((g) => g.key === item.reward)?.name}</strong>
              <small>#{item.serial}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="profile-gifts-empty">
          <Gift size={38} />
          <h2>Здесь будут подарки</h2>
          <p>
            {own
              ? 'Выбери свои подарки в настройках оформления.'
              : 'Игрок пока не добавил подарки в профиль.'}
          </p>
          {own && <a href="#collection">Открыть коллекции</a>}
        </div>
      )}
    </section>
  );
}
export function ProfileEditor({
  person,
  initialTab,
  onClose,
  onSaved,
}: {
  person: ProfilePerson;
  initialTab: 'profile' | 'appearance';
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const shop = useResource<{ appearance: Appearance; inventory: OwnedItem[] }>('/collection', true);
  const [tab, setTab] = useState(initialTab),
    [name, setName] = useState(person.username),
    [bio, setBio] = useState(person.bio),
    [birthday, setBirthday] = useState(person.birthday || ''),
    [photo, setPhoto] = useState(''),
    [draft, setDraft] = useState<ProfileStyle | null>(null),
    [selected, setSelected] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const a = shop.data?.appearance,
    style = draft || a?.style || defaultProfileStyle,
    chosen = selected || a?.featured.map((i) => i.id) || [],
    inventory = shop.data?.inventory.filter((i) => i.kind === 'gift') || [],
    limit = a?.premium ? 6 : 1;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (tab === 'profile')
        await api(
          '/social/me',
          json('PATCH', { username: name, bio, birthday, ...(photo ? { photo } : {}) }),
        );
      else
        await api(
          '/collection/appearance',
          json('PATCH', { emoji: a?.emoji || '', featured: chosen, style }),
        );
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function setStyle(p: Partial<ProfileStyle>) {
    setDraft({ ...style, ...p });
  }
  return (
    <Dialog title={tab === 'profile' ? 'Редактировать профиль' : 'Оформление профиля'} onClose={onClose}>
      <div className="profile-settings">
        <div className="profile-editor-tabs">
          <button type="button" aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>
            Профиль
          </button>
          <button type="button" aria-pressed={tab === 'appearance'} onClick={() => setTab('appearance')}>
            Оформление
          </button>
        </div>
        <ErrorNotice text={error || shop.error} />
        <form onSubmit={(e) => void save(e)}>
          {tab === 'profile' ? (
            <>
              <label>
                Ник
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={40}
                  required
                />
              </label>
              <label>
                О себе
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
              </label>
              <label>
                День рождения · необязательно
                <input
                  aria-label="День рождения"
                  type="date"
                  value={birthday}
                  min="1900-01-01"
                  max={new Date(Date.now() + 14400000).toISOString().slice(0, 10)}
                  onChange={(e) => setBirthday(e.target.value)}
                />
              </label>
              {birthday && (
                <button type="button" onClick={() => setBirthday('')}>
                  Убрать день рождения
                </button>
              )}
              <label>
                Фото до 2 МБ
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 2 * 1024 * 1024) {
                      setError('Фото должно быть меньше 2 МБ.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setPhoto(String(reader.result));
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
              {photo && <img className="profile-photo-preview" src={photo} alt="Новое фото" />}
            </>
          ) : (
            <>
              <div className="profile-style-preview" style={background(style)}>
                <Pattern style={style} />
                <Avatar name={person.username} url={person.avatar} />
                <strong>{person.username}</strong>
              </div>
              <fieldset>
                <legend>Цвет фона</legend>
                <div className="profile-palette-grid">
                  {profilePalettes.map((p) => (
                    <button
                      type="button"
                      key={p.name}
                      aria-label={'Палитра ' + p.name}
                      aria-pressed={style.color === p.color && style.accent === p.accent}
                      style={{ background: `linear-gradient(135deg,${p.color},${p.accent})` }}
                      onClick={() => setStyle({ color: p.color, accent: p.accent })}
                    >
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                <div className="profile-color-inputs">
                  <label>
                    Основной цвет
                    <input
                      type="color"
                      value={style.color}
                      onChange={(e) => setStyle({ color: e.target.value })}
                    />
                  </label>
                  <label>
                    Второй цвет
                    <input
                      type="color"
                      value={style.accent}
                      onChange={(e) => setStyle({ accent: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>
              <label>
                Узор
                <select
                  aria-label="Узор"
                  value={style.pattern}
                  onChange={(e) => setStyle({ pattern: e.target.value as ProfileStyle['pattern'] })}
                >
                  {profilePatterns.map((p) => (
                    <option key={p} value={p}>
                      {patternNames[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Заметность узора · {style.intensity}%
                <input
                  type="range"
                  min="0"
                  max="35"
                  value={style.intensity}
                  onChange={(e) => setStyle({ intensity: Number(e.target.value) })}
                />
              </label>
              <label>
                Расположение подарков
                <select
                  value={style.giftLayout}
                  onChange={(e) => setStyle({ giftLayout: e.target.value as ProfileStyle['giftLayout'] })}
                >
                  <option value="orbit">Вокруг аватара</option>
                  <option value="name">Рядом с именем</option>
                  <option value="both">Вокруг аватара и рядом с именем</option>
                  <option value="none">Только во вкладке подарков</option>
                </select>
              </label>
              <label>
                Подарок рядом с именем
                <select
                  value={style.statusGiftId}
                  onChange={(e) => setStyle({ statusGiftId: e.target.value })}
                >
                  <option value="">Не показывать</option>
                  {inventory.map((i) => (
                    <option value={i.id} key={i.id}>
                      {gifts.find((g) => g.key === i.reward)?.name} #{i.serial}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Подарки вокруг аватара · до {limit}</legend>
                <div className="profile-gift-picker">
                  {inventory.map((i) => (
                    <label key={i.id}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(i.id)}
                        disabled={!chosen.includes(i.id) && chosen.length >= limit}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? [...chosen, i.id] : chosen.filter((id) => id !== i.id),
                          )
                        }
                      />
                      <GiftArt itemKey={i.reward} small />
                      <span>
                        {gifts.find((g) => g.key === i.reward)?.name} #{i.serial}
                      </span>
                    </label>
                  ))}
                </div>
                {!inventory.length && <a href="#collection">Получить первый подарок в коллекциях</a>}
              </fieldset>
            </>
          )}
          <button className="rr-button primary" disabled={busy || (tab === 'appearance' && !shop.data)}>
            {busy ? 'Сохраняем…' : tab === 'profile' ? 'Сохранить профиль' : 'Сохранить оформление'}
          </button>
        </form>
      </div>
    </Dialog>
  );
}
