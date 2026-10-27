import * as workspaceStorage from './workspaceStorage';
import { addDays, dayStart, weekStart } from './planner';
export type HabitStatus = 'done' | 'rest';
export type Habit = {
  resumeAfterArchive?: boolean;
  recurrence?: HabitRecurrence;
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
    const raw = workspaceStorage.getItem(HABIT_KEY);
    if (raw === null) return { habits: [], error: false };
    const x = JSON.parse(raw);
    if (
      x.version !== 1 ||
      !Array.isArray(x.habits) ||
      !x.habits.every(validHabit) ||
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
    workspaceStorage.setItem(HABIT_KEY, JSON.stringify({ version: 1, habits }));
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event('lbd-habits-updated'));
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

export type HabitRule = {
  id: string;
  effectiveDate: string;
  startDate: string;
  time: string;
  days: number[];
  minutes: number;
};
export type HabitRecurrence = {
  rules: HabitRule[];
  pauses: { from: number; to?: number }[];
  endedAt?: number;
};
export function validRecurrence(r: HabitRecurrence) {
  return (
    !!r &&
    Array.isArray(r.rules) &&
    r.rules.length > 0 &&
    r.rules.every(
      (x) =>
        x &&
        typeof x.id === 'string' &&
        validDate(x.effectiveDate) &&
        validDate(x.startDate) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) &&
        Array.isArray(x.days) &&
        x.days.length > 0 &&
        new Set(x.days).size === x.days.length &&
        x.days.every((n) => Number.isInteger(n) && n >= 0 && n <= 6) &&
        Number.isInteger(x.minutes) &&
        x.minutes >= 1 &&
        x.minutes <= 1440,
    ) &&
    Array.isArray(r.pauses) &&
    r.pauses.every(
      (p) =>
        p &&
        Number.isFinite(p.from) &&
        p.from >= 0 &&
        (p.to === undefined || (Number.isFinite(p.to) && p.to >= p.from)),
    ) &&
    (r.endedAt === undefined || (Number.isFinite(r.endedAt) && r.endedAt >= 0))
  );
}
export function recurrenceState(
  h: Habit,
): 'off' | 'active' | 'paused' | 'ended' {
  return !h.recurrence
    ? 'off'
    : h.recurrence.endedAt !== undefined
      ? 'ended'
      : h.recurrence.pauses.some((p) => p.to === undefined)
        ? 'paused'
        : 'active';
}
export function setHabitSchedule(
  h: Habit,
  startDate: string,
  time: string,
  now = new Date(),
): Habit {
  if (recurrenceState(h) === 'ended') return h;
  const r = h.recurrence ?? { rules: [], pauses: [] };
  const last = r.rules.at(-1);
  if (
    last &&
    last.startDate === startDate &&
    last.time === time &&
    last.minutes === h.minutes &&
    JSON.stringify(last.days) === JSON.stringify(h.days)
  )
    return h;
  const rule: HabitRule = {
    id: crypto.randomUUID(),
    effectiveDate: r.rules.length ? localDate(now) : startDate,
    startDate,
    time,
    days: [...h.days],
    minutes: h.minutes,
  };
  return { ...h, recurrence: { ...r, rules: [...r.rules, rule] } };
}
export function pauseHabit(h: Habit, now = Date.now()): Habit {
  if (recurrenceState(h) !== 'active') return h;
  return {
    ...h,
    recurrence: {
      ...h.recurrence!,
      pauses: [...h.recurrence!.pauses, { from: now }],
    },
  };
}
export function resumeHabit(h: Habit, now = Date.now()): Habit {
  if (recurrenceState(h) !== 'paused') return h;
  return {
    ...h,
    recurrence: {
      ...h.recurrence!,
      pauses: h.recurrence!.pauses.map((p) =>
        p.to === undefined ? { ...p, to: Math.max(p.from, now) } : p,
      ),
    },
  };
}
export function endHabit(h: Habit, now = Date.now()): Habit {
  if (!h.recurrence || recurrenceState(h) === 'ended') return h;
  return { ...h, recurrence: { ...h.recurrence, endedAt: now } };
}
export function habitOccurrence(h: Habit, date: string) {
  if (!h.recurrence || !validDate(date)) return undefined;
  const rule = [...h.recurrence.rules]
    .reverse()
    .find((r) => r.effectiveDate <= date);
  if (
    !rule ||
    date < rule.startDate ||
    !rule.days.includes(new Date(`${date}T12:00:00`).getDay())
  )
    return undefined;
  const start = new Date(`${date}T${rule.time}:00`).getTime();
  if (
    (h.recurrence.endedAt !== undefined && start >= h.recurrence.endedAt) ||
    h.recurrence.pauses.some(
      (p) => start >= p.from && (p.to === undefined || start < p.to),
    )
  )
    return undefined;
  return {
    start,
    end: start + rule.minutes * 60000,
    minutes: rule.minutes,
    ruleId: rule.id,
  };
}

export function archiveHabit(h: Habit, now = Date.now()): Habit {
  return {
    ...pauseHabit(h, now),
    archived: true,
    resumeAfterArchive: recurrenceState(h) === 'active',
  };
}
export function restoreHabit(h: Habit, now = Date.now()): Habit {
  return {
    ...(h.resumeAfterArchive ? resumeHabit(h, now) : h),
    archived: false,
    resumeAfterArchive: undefined,
  };
}

export function validHabit(h: Habit) {
  return (
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
    (h.resumeAfterArchive === undefined ||
      typeof h.resumeAfterArchive === 'boolean') &&
    (h.recurrence === undefined || validRecurrence(h.recurrence)) &&
    h.logs &&
    typeof h.logs === 'object' &&
    !Array.isArray(h.logs) &&
    Object.entries(h.logs).every(
      ([d, s]) => validDate(d) && ['done', 'rest'].includes(s),
    )
  );
}
