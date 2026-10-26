import { addDays, dayStart, weekStart } from './planner';
export type HabitStatus = 'done' | 'rest';
export type Habit = {
  id: string;
  name: string;
  category: string;
  days: number[];
  weeklyTarget: number;
  minutes: number;
  archived: boolean;
  logs: Record<string, HabitStatus>;
};
export const HABIT_KEY = 'lbd-focus-v2-habits';
export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return Number.isFinite(+d) && localDate(d) === s;
}
export function loadHabits(): { habits: Habit[]; error: boolean } {
  try {
    const raw = localStorage.getItem(HABIT_KEY);
    if (raw === null) return { habits: [], error: false };
    const x = JSON.parse(raw);
    if (
      x.version !== 1 ||
      !Array.isArray(x.habits) ||
      !x.habits.every(
        (h: Habit) =>
          h &&
          typeof h.id === 'string' &&
          h.id &&
          typeof h.name === 'string' &&
          h.name.trim() &&
          typeof h.category === 'string' &&
          Array.isArray(h.days) &&
          h.days.length > 0 &&
          new Set(h.days).size === h.days.length &&
          h.days.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
          Number.isInteger(h.weeklyTarget) &&
          h.weeklyTarget >= 1 &&
          h.weeklyTarget <= h.days.length &&
          Number.isInteger(h.minutes) &&
          h.minutes >= 1 &&
          h.minutes <= 1440 &&
          typeof h.archived === 'boolean' &&
          h.logs &&
          typeof h.logs === 'object' &&
          !Array.isArray(h.logs) &&
          Object.entries(h.logs).every(
            ([d, s]) => validDate(d) && ['done', 'rest'].includes(s),
          ),
      ) ||
      new Set(x.habits.map((h: Habit) => h.id)).size !== x.habits.length
    )
      throw Error();
    return { habits: x.habits, error: false };
  } catch {
    return { habits: [], error: true };
  }
}
export function saveHabits(habits: Habit[]) {
  try {
    localStorage.setItem(HABIT_KEY, JSON.stringify({ version: 1, habits }));
    return true;
  } catch {
    return false;
  }
}
export function cycleLog(h: Habit, date: string, today = new Date()): Habit {
  if (
    h.archived ||
    !validDate(date) ||
    date > localDate(today) ||
    !h.days.includes(new Date(`${date}T12:00:00`).getDay())
  )
    return h;
  const logs = { ...h.logs };
  if (!logs[date]) logs[date] = 'done';
  else if (logs[date] === 'done') logs[date] = 'rest';
  else delete logs[date];
  return { ...h, logs };
}
export function habitProgress(h: Habit, date: Date, today = new Date()) {
  const start = weekStart(date, 1),
    week = Array.from({ length: 7 }, (_, i) => localDate(addDays(start, i))),
    monthPrefix = localDate(date).slice(0, 7);
  const monthDays = Array.from(
    { length: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() },
    (_, i) => new Date(date.getFullYear(), date.getMonth(), i + 1),
  );
  let streak = 0,
    previous = dayStart(today);
  if (!h.logs[localDate(previous)]) previous = addDays(previous, -1);
  const dates = Object.keys(h.logs).sort();
  const earliest = dates[0];
  while (earliest && localDate(previous) >= earliest) {
    const key = localDate(previous);
    if (h.days.includes(previous.getDay())) {
      if (h.logs[key] === 'done') streak++;
      else if (h.logs[key] !== 'rest') break;
    }
    previous = addDays(previous, -1);
  }
  return {
    weekDone: week.filter((d) => h.logs[d] === 'done').length,
    monthDone: Object.entries(h.logs).filter(
      ([d, s]) => d.startsWith(monthPrefix) && s === 'done',
    ).length,
    monthScheduled: monthDays.filter((d) => h.days.includes(d.getDay())).length,
    streak,
  };
}
