export const profilePatterns = [
  'none',
  'stars',
  'hearts',
  'paws',
  'diamonds',
  'crowns',
  'flowers',
  'lightning',
] as const;
export type ProfileStyle = {
  color: string;
  accent: string;
  pattern: (typeof profilePatterns)[number];
  intensity: number;
  giftLayout: 'orbit' | 'name' | 'both' | 'none';
  statusGiftId: string;
};
export const defaultProfileStyle: ProfileStyle = {
  color: '#53457d',
  accent: '#262b50',
  pattern: 'stars',
  intensity: 16,
  giftLayout: 'orbit',
  statusGiftId: '',
};
export const profilePalettes = [
  { name: 'Аметист', color: '#655080', accent: '#343458' },
  { name: 'Роза', color: '#b46374', accent: '#783957' },
  { name: 'Океан', color: '#367d99', accent: '#294e82' },
  { name: 'Мята', color: '#438c82', accent: '#26555e' },
  { name: 'Закат', color: '#c37762', accent: '#7f496a' },
  { name: 'Графит', color: '#292b32', accent: '#111217' },
  { name: 'Лаванда', color: '#b7a5d8', accent: '#d8c8e9' },
  { name: 'Персик', color: '#f0c3b1', accent: '#e4a4aa' },
] as const;
