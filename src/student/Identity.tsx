import { createContext, useContext, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../api';
import { useResource } from './common';
import { gifts } from '../../shared/collection';
import './identity.css';
import { AnimatedGift } from './AnimatedGift';
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
  verificationBadge?: 'founder' | 'staff' | null;
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
  return (
    <span className="sdvs-player-name">
      <span>{identity?.username || name || fallback}</span>
      {badge && (
        <span
          className={`sdvs-verification badge-${badge}`}
          title={badge === 'founder' ? 'Основатель SDVS' : 'Команда SDVS · назначенная должность'}
          aria-label={
            badge === 'founder' ? 'Подтверждённый основатель SDVS' : 'Подтверждённый сотрудник SDVS'
          }
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              className="badge-outline"
              d="m12 2 2.6 1.8 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22l-2.6-1.8-3.2.1-1-3-2.6-1.9 1-3-1-3 2.6-1.9 1-3 3.2.1Z"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              className="badge-tick"
              d="m7.5 12 3 3 6-6"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {identity?.premium && <Sparkles className="sdvs-premium-star" size={14} aria-label="Премиум" />}
    </span>
  );
}
export function GiftArt({ itemKey, small = false }: { itemKey: string; small?: boolean }) {
  const gift = gifts.find((g) => g.key === itemKey);
  if (!gift) return null;
  return (
    <div
      className={`sdvs-gift-art ${small ? 'small' : ''} gift-${gift.key}`}
      style={{ '--gift-color': gift.color } as React.CSSProperties}
    >
      <span className="sdvs-gift-orbit" aria-hidden="true" />
      {gift.key === 'tsarukyan' ? (
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
