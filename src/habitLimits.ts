import type { HabitRecurrence, HabitRule } from './habits';
export type HabitEnding =
  { type: 'count'; count: number } | { type: 'date'; date: string };
const DAY = 86400000;
const civil = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};
const localCivil = (d: Date) =>
  Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
const localStart = (day: number, time: string) => {
  const d = new Date(day * DAY);
  return +new Date(`${d.toISOString().slice(0, 10)}T${time}:00`);
};
export function orderedRules(r: HabitRecurrence) {
  return [...r.rules].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate),
  );
}
function slots(days: number[], start: number, end: number) {
  if (end < start) return 0;
  const length = end - start + 1,
    whole = Math.floor(length / 7),
    weekday = new Date(start * DAY).getUTCDay();
  return (
    whole * days.length +
    Array.from({ length: length % 7 }, (_, i) => (weekday + i) % 7).filter(
      (d) => days.includes(d),
    ).length
  );
}
// The first civil day whose scheduled local start is >= a real instant (DST safe).
const cutoffDay = (at: number, time: string) => {
  const day = localCivil(new Date(at));
  return day + (localStart(day, time) < at ? 1 : 0);
};
function candidates(
  r: HabitRecurrence,
  rule: HabitRule,
  start: number,
  end: number,
) {
  if (r.endedAt !== undefined)
    end = Math.min(end, cutoffDay(r.endedAt, rule.time) - 1);
  if (rule.ending?.type === 'date')
    end = Math.min(end, civil(rule.ending.date));
  if (end < start) return 0;
  const pauses = r.pauses
    .map((p) => [
      Math.max(start, cutoffDay(p.from, rule.time)),
      Math.min(end, p.to === undefined ? end : cutoffDay(p.to, rule.time) - 1),
    ])
    .filter(([a, b]) => b >= a)
    .sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const pause of pauses) {
    const last = merged.at(-1);
    if (last && pause[0] <= last[1] + 1) last[1] = Math.max(last[1], pause[1]);
    else merged.push([...pause]);
  }
  return (
    slots(rule.days, start, end) -
    merged.reduce((n, [a, b]) => n + slots(rule.days, a, b), 0)
  );
}
/** Lifetime scheduled slots, independent of materialized Calendar ranges and completion logs. */
export function scheduledThrough(r: HabitRecurrence, date: string) {
  const through = civil(date),
    rules = orderedRules(r);
  let total = 0;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i],
      start = Math.max(civil(rule.effectiveDate), civil(rule.startDate));
    const end = Math.min(
      through,
      rules[i + 1] ? civil(rules[i + 1].effectiveDate) - 1 : through,
    );
    const count = candidates(r, rule, start, end);
    total +=
      rule.ending?.type === 'count'
        ? Math.min(count, Math.max(0, rule.ending.count - total))
        : count;
  }
  return total;
}
export function allowedByEnding(r: HabitRecurrence, date: string) {
  const previous = new Date((civil(date) - 1) * DAY).toISOString().slice(0, 10);
  return scheduledThrough(r, date) > scheduledThrough(r, previous);
}
export function endingReached(r: HabitRecurrence, now: Date) {
  const today = new Date(localCivil(now) * DAY).toISOString().slice(0, 10);
  const rule = orderedRules(r)
    .filter((x) => x.effectiveDate <= today)
    .at(-1);
  if (!rule?.ending) return false;
  if (rule.ending.type === 'date') return today > rule.ending.date;
  const previous = new Date((civil(today) - 1) * DAY)
    .toISOString()
    .slice(0, 10);
  return (
    scheduledThrough(r, previous) >= rule.ending.count ||
    (scheduledThrough(r, today) >= rule.ending.count &&
      +now >= localStart(civil(today), rule.time))
  );
}
