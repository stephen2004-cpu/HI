import { afterEach, expect, it, vi } from 'vitest';
import {
  addDays,
  dayStart,
  defaultPlanner,
  layoutDay,
  loadPlanner,
  plannedSeconds,
  savePlanner,
  weekStart,
  type TimeBlock,
} from './planner';
afterEach(() => vi.unstubAllGlobals());
const day = new Date(2026, 9, 26),
  start = +day;
const block = (id: string, a: number, b: number): TimeBlock => ({
  id,
  taskId: 't',
  title: 'Task',
  start: start + a * 60000,
  end: start + b * 60000,
  color: '',
});
it('calculates Monday week across month boundaries without changing dates', () => {
  expect(weekStart(new Date(2026, 10, 1), 1)).toEqual(day);
  expect(addDays(day, 7)).toEqual(new Date(2026, 10, 2));
  expect(dayStart(new Date(2026, 9, 26, 17))).toEqual(day);
});
it('lays out overlapping blocks in lanes and splits midnight blocks', () => {
  const blocks = [
    block('a', 60, 120),
    block('b', 90, 150),
    block('c', 180, 210),
    block('d', 1380, 1500),
  ];
  const layout = layoutDay(blocks, day);
  expect(layout.map((x) => [x.lane, x.lanes])).toEqual([
    [0, 2],
    [1, 2],
    [0, 1],
    [0, 1],
  ]);
  expect(layout[3].height).toBe(60);
  expect(layoutDay(blocks, addDays(day, 1))[0]).toMatchObject({
    top: 0,
    height: 60,
  });
  expect(plannedSeconds(blocks, 't')).toBe(270 * 60);
});
it('persists planner preferences and multiple blocks without touching other keys', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  expect(loadPlanner().error).toBe(false);
  const data = {
    ...defaultPlanner,
    blocks: [block('a', 60, 120), block('b', 180, 210)],
  };
  expect(savePlanner(data)).toBe(true);
  expect(loadPlanner().data).toEqual(data);
  expect(values.size).toBe(1);
});
it('keeps corrupted input untouched and reports failed writes', () => {
  const set = vi.fn(() => {
    throw Error('quota');
  });
  vi.stubGlobal('localStorage', { getItem: () => '{bad', setItem: set });
  expect(loadPlanner().error).toBe(true);
  expect(set).not.toHaveBeenCalled();
  expect(savePlanner(defaultPlanner)).toBe(false);
});
