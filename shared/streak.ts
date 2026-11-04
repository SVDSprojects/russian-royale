export type StreakAdjustment = { day: string; count: number };
export const streakDay = (time: number) => new Date(time + 14400000).toISOString().slice(0, 10);
export function streakAt(activity: { day: string }[], day: string, adjustment?: StreakAdjustment | null) {
  const days = new Set(activity.map((a) => a.day));
  const base = adjustment && adjustment.day <= day ? adjustment : null;
  let time = Date.parse(day + 'T12:00:00Z'),
    count = 0;
  const current = () => new Date(time).toISOString().slice(0, 10);
  if (current() !== base?.day && !days.has(current())) time -= 86400000;
  while (true) {
    const d = current();
    if (d === base?.day) return base.count + count;
    if (!days.has(d)) return count;
    count++;
    time -= 86400000;
  }
}
