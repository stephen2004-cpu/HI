import { afterEach, expect, it, vi } from 'vitest';
import { createTaskRepeat, editFutureTaskRepeat } from './taskRecurrence';
import {
  scheduleTaskRepeats,
  scheduleOf,
  repeatDraft,
  visibleTaskBlocks,
  persistTaskCalendar,
} from './taskScheduling';
import { defaultPlanner, type Planner } from './planner';
import type { Task } from './tasks';
import { applyCalendarEdit } from './recurrence';
const now = new Date(2026, 9, 31, 8),
  from = new Date(2026, 9, 26),
  to = new Date(2026, 10, 2);
const source: Task = {
  id: 'vnr',
  title: 'Học VNR',
  notes: '',
  group: 'schedule',
  color: '',
  completed: false,
  plannedStart: '2026-10-31T09:00',
  plannedEndTime: '11:15',
  timing: { mode: 'timer', focusMinutes: 25, focusCount: 1, breakMinutes: 0 },
};
const settings = {
  mode: 'weekly' as const,
  startDate: '2026-10-31',
  days: [2, 5],
  ending: { type: 'count' as const, count: 4 },
};
const setup = (extra = {}) => {
  const t = { ...source, ...extra };
  t.repeatSchedule = scheduleOf(t);
  const { root, instance } = createTaskRepeat(t, settings);
  return [root, instance];
};
const plan = (
  tasks = setup(),
  planner: Planner = structuredClone(defaultPlanner),
) => scheduleTaskRepeats(tasks, planner, from, to, new Set(), now);
afterEach(() => vi.unstubAllGlobals());
it('creates all four Tue/Fri 09:00–11:15 blocks beyond the visible week, with stable IDs on reload and month changes', () => {
  const a = plan();
  expect(a.added).toBe(4);
  expect(a.planner.blocks.map((b) => new Date(b.start).getDate())).toEqual([
    3, 6, 10, 13,
  ]);
  for (const b of a.planner.blocks) {
    expect(new Date(b.start).getHours()).toBe(9);
    expect((b.end - b.start) / 60000).toBe(135);
  }
  const again = plan(a.tasks, a.planner);
  expect(again.added).toBe(0);
  expect(again.planner).toEqual(a.planner);
  const month = scheduleTaskRepeats(
    again.tasks,
    again.planner,
    new Date(2026, 10, 1),
    new Date(2026, 11, 1),
    new Set(),
    now,
  );
  expect(month.added).toBe(0);
  expect(month.tasks).toEqual(again.tasks);
});
it('uses inclusive ending dates, leaves unlimited chains bounded to each displayed range and keeps completion independent', () => {
  const finite = setup();
  finite[0].repeat!.rules[0].ending = { type: 'date', date: '2026-11-06' };
  const a = plan(finite);
  expect(a.planner.blocks).toHaveLength(2);
  const tasks = setup();
  delete tasks[0].repeat!.rules[0].ending;
  const b = scheduleTaskRepeats(
    tasks,
    structuredClone(defaultPlanner),
    new Date(2026, 10, 2),
    new Date(2026, 10, 9),
    new Set(),
    now,
  );
  expect(b.planner.blocks).toHaveLength(2);
  const done = b.tasks.map((t) =>
    t.id === b.planner.blocks[0].taskId ? { ...t, completed: true } : t,
  );
  const c = plan(done, b.planner);
  expect(c.tasks.filter((t) => t.completed)).toHaveLength(1);
  expect(c.planner.blocks).toHaveLength(2);
});
it('never guesses a time; supports legacy source time without overwriting custom/multiple existing blocks', () => {
  const noTime = setup({ plannedStart: undefined, plannedEndTime: undefined });
  expect(plan(noTime).added).toBe(0);
  const old = setup();
  for (const t of old) delete t.repeatSchedule;
  delete old[0].repeat!.rules[0].template.repeatSchedule;
  const custom = {
    id: 'manual',
    taskId: 'vnr',
    title: 'Custom',
    start: +new Date(2026, 10, 3, 13),
    end: +new Date(2026, 10, 3, 14),
    color: '',
  };
  const a = plan(old, { ...structuredClone(defaultPlanner), blocks: [custom] });
  expect(a.added).toBe(3);
  expect(a.planner.blocks[0]).toEqual(custom);
  expect(a.planner.blocks.filter((b) => b.taskId === 'vnr')).toHaveLength(1);
});
it('warns about overlaps without replacing unrelated blocks', () => {
  const other = {
    id: 'other',
    taskId: 'independent',
    title: 'Keep',
    start: +new Date(2026, 10, 3, 10),
    end: +new Date(2026, 10, 3, 12),
    color: '',
  };
  const a = plan(setup(), {
    ...structuredClone(defaultPlanner),
    blocks: [other],
  });
  expect(a.conflicts).toBe(1);
  expect(a.planner.blocks[0]).toEqual(other);
  expect(a.added).toBe(4);
});
it('preserves dragged/resized/cancelled occurrences; updates other future blocks and retains completed history', () => {
  const a = plan();
  const dragged = {
    ...a.planner,
    blocks: a.planner.blocks.map((b, i) =>
      i === 1 ? { ...b, start: b.start + 3600000, end: b.end + 3600000 } : b,
    ),
  };
  const edited = applyCalendarEdit(a.planner, a.planner.blocks, dragged);
  expect(edited.blocks[1].taskOverride).toBe(true);
  const cancelled = applyCalendarEdit(edited, edited.blocks, {
    ...edited,
    blocks: edited.blocks.filter((_, i) => i !== 2),
  });
  expect(
    cancelled.blocks.find((b) => b.id === a.planner.blocks[2].id)?.cancelled,
  ).toBe(true);
  const first = a.tasks.find((t) => t.id === 'vnr')!;
  const done = a.tasks.map((t) =>
    t.id === first.id ? { ...t, completed: true } : t,
  );
  const draft = { ...first, repeatSchedule: { time: '14:00', minutes: 60 } };
  const changed = editFutureTaskRepeat(
    done,
    { ...first, completed: true },
    draft,
    settings,
    new Set(),
    now,
  );
  const b = plan(changed, cancelled);
  expect(b.planner.blocks[0]).toEqual(a.planner.blocks[0]);
  expect(b.planner.blocks[1]).toEqual(edited.blocks[1]);
  expect(
    b.planner.blocks.find((x) => x.id === a.planner.blocks[2].id)?.cancelled,
  ).toBe(true);
  expect(
    new Date(
      b.planner.blocks.find((x) => x.id === a.planner.blocks[3].id)!.start,
    ).getHours(),
  ).toBe(14);
});
it('single edits move only that occurrence; stopping and Task tombstones hide/cancel future automatic blocks without resurrection', () => {
  const a = plan();
  const selected = a.tasks.find((t) => t.repeatDate === '2026-11-06')!;
  const b = plan(
    a.tasks.map((t) =>
      t.id === selected.id
        ? {
            ...t,
            repeatOverride: true,
            repeatSchedule: { time: '16:00', minutes: 90 },
            plannedStart: '2026-11-07T16:00',
          }
        : t,
    ),
    a.planner,
  );
  expect(new Date(b.planner.blocks[1].start).getDate()).toBe(7);
  expect(b.planner.blocks[0]).toEqual(a.planner.blocks[0]);
  const deleted = plan(
    b.tasks.map((t) => (t.id === selected.id ? { ...t, deletedAt: 123 } : t)),
    b.planner,
  );
  expect(
    visibleTaskBlocks(deleted.planner.blocks, deleted.tasks, new Set(), now),
  ).toHaveLength(3);
  expect(plan(deleted.tasks, deleted.planner).added).toBe(0);
  const first = deleted.tasks.find((t) => t.id === 'vnr')!;
  const stopped = editFutureTaskRepeat(
    deleted.tasks,
    first,
    first,
    { ...settings, mode: 'none' },
    new Set(),
    now,
  );
  const c = plan(stopped, deleted.planner);
  expect(
    visibleTaskBlocks(c.planner.blocks, c.tasks, new Set(), now),
  ).toHaveLength(0);
});
it('rolls back Task writes if planner storage fails, preserving legacy data', () => {
  const values = new Map<string, string>([
    ['lbd-focus-v1', 'original'],
    ['lbd-focus-v2-tasks', JSON.stringify({ version: 1, tasks: [] })],
  ]);
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === 'lbd-focus-v2-planner') throw Error('quota');
      values.set(k, v);
    },
    removeItem: (k: string) => values.delete(k),
  });
  const a = plan();
  expect(persistTaskCalendar(a.tasks, a.planner)).toBe(false);
  expect(JSON.parse(values.get('lbd-focus-v2-tasks')!).tasks).toEqual([]);
  expect(values.get('lbd-focus-v1')).toBe('original');
  expect(values.has('lbd-focus-v2-planner')).toBe(false);
});
it('rejects invalid explicit end times and excessive finite schedules before writing anything', () => {
  expect(() => scheduleOf({ ...source, plannedEndTime: '08:00' })).toThrow();
  const overnight = repeatDraft({
    ...source,
    plannedStart: undefined,
    plannedEndTime: undefined,
    repeatDate: '2026-11-03',
    repeatSchedule: { time: '23:00', minutes: 90 },
    timing: { mode: 'timer', focusMinutes: 90, focusCount: 1, breakMinutes: 0 },
  });
  expect(overnight.plannedEndTime).toBeUndefined();
  expect(scheduleOf(overnight)?.minutes).toBe(90);
  const t = setup();
  t[0].repeat!.rules[0].ending = { type: 'count', count: 10001 };
  expect(() => plan(t)).toThrow('10.000');
});

it('replaces future weekdays with exactly the finite number of valid blocks, retaining cancellation markers for old dates', () => {
  const a = plan(),
    first = a.tasks.find((t) => t.id === 'vnr')!;
  const revised = editFutureTaskRepeat(
    a.tasks,
    first,
    first,
    { ...settings, days: [3] },
    new Set(),
    now,
  );
  const b = plan(revised, a.planner),
    active = visibleTaskBlocks(b.planner.blocks, b.tasks, new Set(), now);
  expect(active).toHaveLength(4);
  expect(active.map((b) => new Date(b.start).getDay())).toEqual([3, 3, 3, 3]);
  expect(b.planner.blocks.filter((b) => b.cancelled)).toHaveLength(4);
  const again = plan(b.tasks, b.planner);
  expect(again.added).toBe(0);
  expect(again.planner).toEqual(b.planner);
  const tooLong = setup();
  tooLong[0].repeat!.rules[0].ending = { type: 'date', date: '2300-01-01' };
  expect(() => plan(tooLong)).toThrow('10.000');
});
