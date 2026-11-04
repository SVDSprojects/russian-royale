import { createContext, useContext, useId, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../api';
import { useResource } from './common';
import { gifts } from '../../shared/collection';
import './identity.css';
import { AnimatedGift } from './AnimatedGift';
import { ImportedGift } from './ImportedGift';
import type { ProfileStyle } from '../../shared/profile-style';
export type OwnedItem = {
  id: string;
  kind: 'gift' | 'id';
  reward: string;
  serial: number;
  createdAt: number;
};
export type Appearance = {
  premium: boolean;
  premiumUntil: number;
  emoji: string;
  featured: OwnedItem[];
  verified?: boolean;
  verificationBadge?: 'founder' | 'staff' | 'moderator' | null;
  style?: ProfileStyle;
  statusGift?: OwnedItem | null;
};
type Identity = Appearance & { id: string; username: string; verified: boolean };
const Context = createContext<Identity[]>([]);
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const data = useResource<Identity[]>(user ? '/identities' : null, true);
  return <Context.Provider value={user ? data.data || [] : []}>{children}</Context.Provider>;
}
export function PlayerName({
  id,
  name,
  fallback = 'Игрок',
}: {
  id?: string;
  name?: string;
  fallback?: string;
}) {
  const identities = useContext(Context),
    { user } = useAuth();
  const identity = identities.find((i) => i.id === id);
  const badge = identity ? identity.verificationBadge : id === user?.id ? user?.verificationBadge : null;
  const gradientId = 'verified' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <span className="sdvs-player-name">
      <span>{identity?.username || name || fallback}</span>
      {badge && (
        <span
          className={`sdvs-verification badge-${badge}`}
          title={
            badge === 'founder'
              ? 'Основатель SDVS'
              : badge === 'moderator'
                ? 'Модератор SDVS'
                : 'Команда SDVS · назначенная должность'
          }
          aria-label={
            badge === 'founder'
              ? 'Подтверждённый основатель SDVS'
              : badge === 'moderator'
                ? 'Подтверждённый модератор SDVS'
                : 'Подтверждённый сотрудник SDVS'
          }
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2=".8" y2="1">
                <stop offset="0" stopColor={badge === 'moderator' ? '#9dff00' : '#00d5ff'} />
                <stop offset=".5" stopColor={badge === 'moderator' ? '#05ed3d' : '#008aff'} />
                <stop offset="1" stopColor={badge === 'moderator' ? '#00bd42' : '#2554ff'} />
              </linearGradient>
            </defs>
            <path
              className="badge-outline"
              d={
                badge === 'moderator'
                  ? 'm12 1.1 1.5 2 2.3-1 0.7 2.4 2.5-.1-.2 2.5 2.4.7-1 2.3 2 1.5-2 1.5 1 2.3-2.4.7.2 2.5-2.5-.1-.7 2.4-2.3-1-1.5 2-1.5-2-2.3 1-.7-2.4-2.5.1.2-2.5-2.4-.7 1-2.3-2-1.5 2-1.5-1-2.3 2.4-.7-.2-2.5 2.5.1.7-2.4 2.3 1Z'
                  : 'M11.02 1.65Q12.00 0.90 12.98 1.65L14.51 2.84Q15.48 3.59 16.71 3.75L18.63 3.99Q19.85 4.15 20.01 5.37L20.25 7.29Q20.41 8.52 21.16 9.49L22.35 11.02Q23.10 12.00 22.35 12.98L21.16 14.51Q20.41 15.48 20.25 16.71L20.01 18.63Q19.85 19.85 18.63 20.01L16.71 20.25Q15.48 20.41 14.51 21.16L12.98 22.35Q12.00 23.10 11.02 22.35L9.49 21.16Q8.52 20.41 7.29 20.25L5.37 20.01Q4.15 19.85 3.99 18.63L3.75 16.71Q3.59 15.48 2.84 14.51L1.65 12.98Q0.90 12.00 1.65 11.02L2.84 9.49Q3.59 8.52 3.75 7.29L3.99 5.37Q4.15 4.15 5.37 3.99L7.29 3.75Q8.52 3.59 9.49 2.84L11.02 1.65Z'
              }
              fill={`url(#${gradientId})`}
              strokeWidth=".7"
              strokeLinejoin="round"
            />
            <path
              className="badge-tick"
              d="m7.5 12 3 3 6-6"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {identity?.premium && <Sparkles className="sdvs-premium-star" size={14} aria-label="Премиум" />}
      {identity?.statusGift && ['name', 'both'].includes(identity.style?.giftLayout || '') && (
        <span
          className="profile-name-gift"
          title={gifts.find((g) => g.key === identity.statusGift!.reward)?.name}
        >
          <GiftArt itemKey={identity.statusGift.reward} small />
        </span>
      )}
    </span>
  );
}
export function GiftArt({ itemKey, small = false }: { itemKey: string; small?: boolean }) {
  const gift = gifts.find((g) => g.key === itemKey);
  if (!gift) return null;
  return (
    <div
      className={`sdvs-gift-art ${small ? 'small' : ''} ${'animation' in gift ? 'gift-imported' : ''} gift-${gift.key}`}
      style={{ '--gift-color': gift.color } as React.CSSProperties}
    >
      <span className="sdvs-gift-orbit" aria-hidden="true" />
      {'animation' in gift ? (
        <ImportedGift animation={gift.animation} poster={gift.poster} name={gift.name} />
      ) : gift.key === 'tsarukyan' ? (
        <AnimatedGift />
      ) : (
        <img src={`/assets/collectibles/${gift.key}.webp`} loading="lazy" decoding="async" alt={gift.name} />
      )}
      <span className="sdvs-gift-spark one" aria-hidden="true">
        ✦
      </span>
      <span className="sdvs-gift-spark two" aria-hidden="true">
        ✧
      </span>
    </div>
  );
}
export function ProfileShowcase({ id }: { id: string }) {
  const data = useResource<Appearance>('/collection/profile/' + encodeURIComponent(id), true);
  const a = data.data;
  if (!a || (!a.premium && !a.featured.length)) return null;
  return (
    <div className="sdvs-showcase">
      {a.premium && (
        <div className="sdvs-profile-pattern" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i}>{a.emoji || '✨'}</span>
          ))}
        </div>
      )}
      {a.premium && (
        <p className="sdvs-premium-label">
          <Sparkles size={16} /> Премиум SDVS
        </p>
      )}
      <div className="sdvs-featured-gifts">
        {a.featured.map((item) => (
          <div key={item.id}>
            <GiftArt itemKey={item.reward} small />
            <strong>{gifts.find((g) => g.key === item.reward)?.name}</strong>
            <small>Экземпляр #{item.serial}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
