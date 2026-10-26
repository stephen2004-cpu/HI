import { afterEach, expect, it, vi } from 'vitest';
import {
  cycleLog,
  habitProgress,
  loadHabits,
  saveHabits,
  type Habit,
} from './habits';
afterEach(() => vi.unstubAllGlobals());
const h: Habit = {
  id: 'h',
  name: 'Viết',
  category: 'Công việc',
  days: [1, 3, 5],
  weeklyTarget: 3,
  minutes: 25,
  archived: false,
  logs: {},
};
it('cycles unentered / done / rest and never writes future or non-repeat days', () => {
  const today = new Date(2026, 9, 26);
  const done = cycleLog(h, '2026-10-26', today);
  expect(done.logs['2026-10-26']).toBe('done');
  const rest = cycleLog(done, '2026-10-26', today);
  expect(rest.logs['2026-10-26']).toBe('rest');
  expect(cycleLog(rest, '2026-10-26', today).logs).toEqual({});
  expect(cycleLog(h, '2026-10-28', today)).toBe(h);
  expect(cycleLog(h, '2026-10-25', today)).toBe(h);
  expect(h.logs).toEqual({});
});
it('counts weekly/monthly real logs and treats rest neutrally in a scheduled streak', () => {
  const data = {
    ...h,
    logs: {
      '2026-10-19': 'done',
      '2026-10-21': 'rest',
      '2026-10-23': 'done',
      '2026-10-26': 'done',
    } as Habit['logs'],
  };
  expect(
    habitProgress(data, new Date(2026, 9, 26), new Date(2026, 9, 26)),
  ).toMatchObject({ weekDone: 1, monthDone: 3, monthScheduled: 13, streak: 3 });
  const missed = { ...data, logs: { ...data.logs } };
  delete missed.logs['2026-10-23'];
  expect(
    habitProgress(missed, new Date(2026, 9, 26), new Date(2026, 9, 26)).streak,
  ).toBe(1);
});
it('round trips habit data, preserving other localstorage keys and archived logs', () => {
  const values = new Map([['lbd-focus-v1', 'legacy']]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  expect(loadHabits().error).toBe(false);
  expect(
    saveHabits([{ ...h, archived: true, logs: { '2026-10-26': 'done' } }]),
  ).toBe(true);
  expect(loadHabits().habits[0].logs['2026-10-26']).toBe('done');
  expect(values.get('lbd-focus-v1')).toBe('legacy');
});
it('keeps invalid data untouched and reports quota failures', () => {
  const write = vi.fn(() => {
    throw Error('quota');
  });
  vi.stubGlobal('localStorage', { getItem: () => '{bad', setItem: write });
  expect(loadHabits().error).toBe(true);
  expect(write).not.toHaveBeenCalled();
  expect(saveHabits([h])).toBe(false);
});
