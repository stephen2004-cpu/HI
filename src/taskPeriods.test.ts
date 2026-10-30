import { expect, it } from 'vitest';
import {
  matchesTaskStatus,
  projectTaskPeriod,
  shiftTaskDate,
  taskRange,
} from './taskPeriods';
import type { Task } from './tasks';
import type { TimeBlock } from './planner';
import { deleteHabit, type Habit } from './habits';
const date = (day: number, hour = 0, month = 9) =>
  +new Date(2026, month, day, hour);
const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  notes: '',
  group: 'do',
  color: '',
  completed: false,
  ...patch,
});
const block = (
  id: string,
  taskId: string,
  start: number,
  end: number,
  patch: Partial<TimeBlock> = {},
): TimeBlock => ({
  id,
  taskId,
  title: taskId,
  start,
  end,
  color: '',
  ...patch,
});
const range = taskRange('2026-10-26', 'day');
it('uses local day boundaries, Monday–Sunday weeks, leap months and safe previous/next ranges', () => {
  const w = taskRange('2026-11-01', 'week');
  expect(w.from.getDay()).toBe(1);
  expect(w.from.getDate()).toBe(26);
  expect(w.to.getDate()).toBe(2);
  const m = taskRange('2028-02-29', 'month');
  expect(m.from.getDate()).toBe(1);
  expect(m.to.getMonth()).toBe(2);
  expect(new Date(+m.to - 1).getDate()).toBe(29);
  expect(shiftTaskDate('2026-10-31', 'month', 1)).toBe('2026-11-01');
  expect(shiftTaskDate('2026-11-01', 'day', -1)).toBe('2026-10-31');
  expect(shiftTaskDate('2026-10-26', 'week', 1)).toBe('2026-11-02');
});
it('deduplicates a task with multiple blocks and uses actual blocks ahead of an obsolete planned date', () => {
  const tasks = [task('multi', { plannedStart: '2026-10-25T09:00' })],
    blocks = [
      block('a', 'multi', date(26, 9), date(26, 10)),
      block('b', 'multi', date(26, 14), date(26, 15)),
    ];
  const before = JSON.stringify({ tasks, blocks });
  const rows = projectTaskPeriod(
    tasks,
    blocks,
    blocks,
    [],
    range.from,
    range.to,
    new Date(date(26)),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].blocks).toHaveLength(2);
  expect(rows[0].inRange).toBe(true);
  expect(rows[0].overdue).toBe(false);
  expect(JSON.stringify({ tasks, blocks })).toBe(before);
  const yesterday = taskRange('2026-10-25', 'day');
  expect(
    projectTaskPeriod(
      tasks,
      blocks,
      blocks,
      [],
      yesterday.from,
      yesterday.to,
    )[0].inRange,
  ).toBe(false);
});
it('handles cross-midnight blocks with an exclusive end, without inventing another task', () => {
  const b = block('night', 't', date(25, 23), date(26, 1));
  expect(
    projectTaskPeriod([task('t')], [b], [b], [], range.from, range.to)[0]
      .inRange,
  ).toBe(true);
  const midnight = { ...b, end: date(26) };
  expect(
    projectTaskPeriod(
      [task('t')],
      [midnight],
      [midnight],
      [],
      range.from,
      range.to,
    )[0].inRange,
  ).toBe(false);
});
it('separates unscheduled, overdue, completed and future work without moving a date', () => {
  const tasks = [
    task('none'),
    task('past', { plannedStart: '2026-10-25T14:00' }),
    task('done', { plannedStart: '2026-10-25T14:00', completed: true }),
    task('later', { plannedStart: '2026-11-02T09:00' }),
    task('invalid', { plannedStart: 'invalid' }),
  ];
  const rows = projectTaskPeriod(
    tasks,
    [],
    [],
    [],
    range.from,
    range.to,
    new Date(date(26, 12)),
  );
  expect(rows.filter((r) => r.unscheduled).map((r) => r.task.id)).toEqual([
    'none',
    'invalid',
  ]);
  expect(rows.filter((r) => r.overdue).map((r) => r.task.id)).toEqual(['past']);
  expect(rows.some((r) => r.inRange)).toBe(false);
  expect(tasks[1].plannedStart).toBe('2026-10-25T14:00');
});
it('does not label a task overdue when it has a later active block, and retains completed work for its selected date', () => {
  const tasks = [task('future'), task('done', { completed: true })],
    blocks = [
      block('a', 'future', date(25, 9), date(25, 10)),
      block('b', 'future', date(28, 9), date(28, 10)),
      block('c', 'done', date(26, 9), date(26, 10)),
    ];
  const rows = projectTaskPeriod(
    tasks,
    blocks,
    blocks,
    [],
    range.from,
    range.to,
    new Date(date(26)),
  );
  expect(rows.find((r) => r.task.id === 'future')!.overdue).toBe(false);
  const completed = rows.find((r) => r.task.id === 'done')!;
  expect(completed.inRange).toBe(true);
  expect(matchesTaskStatus(completed, 'done')).toBe(true);
  expect(matchesTaskStatus(completed, 'pending')).toBe(false);
});
it('uses habit instance dates independently; cancelled instances and deleted pending habits cannot return as backlog tasks', () => {
  const h: Habit = {
    id: 'h',
    name: 'habit',
    category: 'Cá nhân',
    days: [1],
    weeklyTarget: 1,
    minutes: 25,
    archived: false,
    logs: { '2026-10-26': 'done' },
  };
  const tasks = [
    task('occ', { habitId: 'h', habitDate: '2026-10-26' }),
    task('other', { habitId: 'h', habitDate: '2026-11-02' }),
  ];
  let rows = projectTaskPeriod(
    tasks,
    [],
    [],
    [h],
    range.from,
    range.to,
    new Date(date(26)),
  );
  expect(rows.filter((r) => r.inRange).map((r) => r.task.id)).toEqual(['occ']);
  expect(tasks[0].completed).toBe(false);
  const cancelled = block('cancel', 'occ', date(26, 9), date(26, 10), {
    cancelled: true,
    recurringHabitId: 'h',
  });
  rows = projectTaskPeriod(
    tasks,
    [],
    [cancelled],
    [h],
    range.from,
    range.to,
    new Date(date(26)),
  );
  expect(rows.some((r) => r.task.id === 'occ')).toBe(false);
  const dead = deleteHabit(h, false, date(26, 8));
  rows = projectTaskPeriod(tasks, [], [], [dead], range.from, range.to);
  expect(rows).toHaveLength(0);
  const retained = projectTaskPeriod(
    [{ ...tasks[0], completed: true }],
    [],
    [],
    [dead],
    range.from,
    range.to,
  );
  expect(retained[0].inRange).toBe(true);
  expect(dead.logs).toEqual(h.logs);
});

it('interprets a date-only legacy planned date as local midnight rather than a UTC timestamp', () => {
  const rows = projectTaskPeriod(
    [task('local', { plannedStart: '2026-10-26' })],
    [],
    [],
    [],
    range.from,
    range.to,
  );
  expect(rows[0].fallback).toBe(+range.from);
  expect(rows[0].fallbackDateOnly).toBe(true);
  expect(rows[0].inRange).toBe(true);
});
