import type { DB } from './storage';
import { streakAt, streakDay, type StreakAdjustment } from '../shared/streak';
export function setupStreaks(db: DB) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS rr_streak_adjustments(user_id TEXT PRIMARY KEY REFERENCES users(id),day TEXT NOT NULL,count INTEGER NOT NULL CHECK(count>=0));CREATE TABLE IF NOT EXISTS rr_admin_streak_commands(actor_id TEXT NOT NULL REFERENCES users(id),command_id TEXT NOT NULL,target_id TEXT NOT NULL REFERENCES users(id),count INTEGER NOT NULL,reason TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor_id,command_id));',
  );
}
export function streakAdjustment(db: DB, uid: string): StreakAdjustment | null {
  return db.prepare('SELECT day,count FROM rr_streak_adjustments WHERE user_id=?').get(uid) ?? null;
}
export function userStreak(db: DB, uid: string, now: number) {
  return streakAt(
    db.prepare('SELECT day FROM rr_daily WHERE user_id=?').all(uid),
    streakDay(now),
    streakAdjustment(db, uid),
  );
}
