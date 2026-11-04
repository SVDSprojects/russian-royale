import { fighterGifts } from './fighter-gifts';
import { additionalGifts } from './additional-gifts';
export const animatedGifts = [...fighterGifts, ...additionalGifts] as const;
export const gifts = [
  ...animatedGifts,
  { key: 'quill', name: 'Огненное перо', emoji: '🪶', rarity: 'common', color: '#ff825c' },
  { key: 'lexicon', name: 'Золотой словарь', emoji: '📚', rarity: 'common', color: '#ffcc67' },
  { key: 'orbit', name: 'Орбитальный конь', emoji: '♞', rarity: 'rare', color: '#a49aff' },
  { key: 'belt', name: 'Пояс чемпиона', emoji: '🏆', rarity: 'rare', color: '#65dfc3' },
  { key: 'tsarukyan', name: 'Арман Царукян', emoji: '🥊', rarity: 'legendary', color: '#d899ff' },
  { key: 'crown', name: 'Корона SDVS', emoji: '👑', rarity: 'legendary', color: '#ffb8df' },
] as const;
export const cases = [
  {
    key: 'standard',
    name: 'Искра',
    price: 500,
    description: 'Первый предмет твоей коллекции',
    odds: { common: 70, rare: 25, legendary: 5 },
  },
  {
    key: 'special',
    name: 'Созвездие',
    price: 2000,
    description: 'Больше редких находок',
    odds: { common: 25, rare: 55, legendary: 20 },
  },
  {
    key: 'identity',
    name: 'Особый номер',
    price: 5000,
    description: 'Один свободный ID от 010000 до 111110',
    odds: null,
  },
] as const;
export const premiumPrice = 30000;
export const profileEmojis = ['✨', '🔥', '👑', '🪐', '💎', '🦋', '🥊', '📚'] as const;
export type GiftKey = (typeof gifts)[number]['key'];
