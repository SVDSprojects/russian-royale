import type { DB } from './storage';
import { HttpError } from './core';
import { defaultProfileStyle, profilePatterns, type ProfileStyle } from '../shared/profile-style';
export function setupProfileDetails(db: DB) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS rr_profile_details(user_id TEXT PRIMARY KEY REFERENCES users(id),birthday TEXT NOT NULL DEFAULT '',style TEXT NOT NULL DEFAULT '{}')",
  );
}
export function getProfileStyle(db: DB, uid: string): ProfileStyle {
  return {
    ...defaultProfileStyle,
    ...JSON.parse(db.prepare('SELECT style FROM rr_profile_details WHERE user_id=?').get(uid)?.style || '{}'),
  };
}
export function validateStyle(value: any, db: DB, uid: string): ProfileStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'Неверное оформление профиля.');
  const style = { ...getProfileStyle(db, uid), ...value };
  if (
    !/^#[0-9a-f]{6}$/i.test(style.color) ||
    !/^#[0-9a-f]{6}$/i.test(style.accent) ||
    !profilePatterns.includes(style.pattern) ||
    !Number.isInteger(style.intensity) ||
    style.intensity < 0 ||
    style.intensity > 35 ||
    !['orbit', 'name', 'both', 'none'].includes(style.giftLayout) ||
    typeof style.statusGiftId !== 'string' ||
    style.statusGiftId.length > 100
  )
    throw new HttpError(400, 'Проверьте цвет, узор и расположение подарков.');
  if (
    style.statusGiftId &&
    !db
      .prepare("SELECT 1 FROM rr_inventory WHERE id=? AND owner_id=? AND kind='gift'")
      .get(style.statusGiftId, uid)
  )
    throw new HttpError(400, 'Подарок рядом с именем должен принадлежать вам.');
  return {
    color: style.color,
    accent: style.accent,
    pattern: style.pattern,
    intensity: style.intensity,
    giftLayout: style.giftLayout,
    statusGiftId: style.statusGiftId,
  };
}
export function saveStyle(db: DB, uid: string, style: ProfileStyle) {
  db.prepare(
    'INSERT INTO rr_profile_details(user_id,style) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET style=excluded.style',
  ).run(uid, JSON.stringify(style));
}
export function birthdayValue(value: unknown, now: number) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new HttpError(400, 'Укажите дату рождения или оставьте поле пустым.');
  const d = new Date(value + 'T00:00:00Z');
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value ||
    Number(value.slice(0, 4)) < 1900 ||
    value > new Date(now + 14400000).toISOString().slice(0, 10)
  )
    throw new HttpError(400, 'Проверьте дату рождения.');
  return value;
}
