import { expect, it } from 'vitest';
import { assessment, suggestion, totals, type Review } from './performance';
import { plannedTask, taskSessions, type Task } from './tasks';
import { begin, advance, record } from './engine';
const task: Task = {
  id: 't',
  title: 'Study',
  notes: '',
  group: 'do',
  color: '',
  completed: false,
  timing: { mode: 'study', focusMinutes: 30, focusCount: 3, breakMinutes: 5 },
};
it('plans 90 focus + 10 break = 100 minutes with no trailing break', () => {
  expect(plannedTask(task)).toEqual({ focus: 5400, rest: 600, total: 6000 });
  const s = taskSessions(task);
  expect(s.map((x) => x.kind)).toEqual([
    'study',
    'break',
    'study',
    'break',
    'study',
  ]);
  expect(s.reduce((n, s) => n + s.seconds, 0)).toBe(6000);
});
it('compares 60 to 80 minutes without judging unfinished 45 minutes as early', () => {
  expect(assessment(3600, 4800, true).delta).toBe(1200);
  expect(assessment(3600, 4800, true).percent).toBeCloseTo(100 / 3);
  expect(assessment(3600, 2700, false).text).toContain('chưa đánh giá');
  expect(assessment(undefined, 0, true).text).toContain('Chưa có dữ liệu');
});
it('deduplicates session ids, separates breaks, and preserves earliest plan', () => {
  const r = begin('study', taskSessions(task), false, 0);
  r.plannedFocusSeconds = 5400;
  const h = record(r, 1800000, 'completed');
  const changed = {
    ...h,
    id: 'second',
    start: 1800001,
    actualSeconds: 30,
    plannedFocusSeconds: 9000,
  };
  expect(totals([changed, h, h])).toMatchObject({
    actual: 1830,
    planned: 5400,
  });
  const rest = {
    ...r,
    index: 1,
    started: 1800000,
    deadline: 2100000,
    remaining: 300000,
  };
  expect(record(rest, 2100000, 'completed')).toMatchObject({
    actualSeconds: 0,
    breakSeconds: 300,
  });
  expect(
    advance({ run: r, history: [] }, 6000000).snapshot.history,
  ).toHaveLength(5);
});
it('requires 3 completed, comparable, output-confirmed reviews before numeric advice', () => {
  const base: Review = {
    runId: '1',
    taskId: 't',
    at: 1,
    completed: true,
    expectedMet: true,
    reason: 'Công việc nhiều hơn dự kiến',
    comment: '',
    actualOutput: 'Done',
    planned: 3600,
    actual: 4800,
  };
  expect(suggestion('t', [base]).seconds).toBeUndefined();
  const rows = [
    base,
    { ...base, runId: '2', at: 2, actual: 4200 },
    { ...base, runId: '3', at: 3, actual: 4500 },
  ];
  expect(suggestion('t', rows).seconds).toBe(4500);
  expect(
    suggestion('t', [
      ...rows,
      { ...base, runId: '4', at: 4, reason: 'Bị mất tập trung' },
    ]).seconds,
  ).toBeUndefined();
});
