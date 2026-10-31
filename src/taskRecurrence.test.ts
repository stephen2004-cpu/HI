import { afterEach, expect, it, vi } from 'vitest';
import {
  createTaskRepeat,
  generateTaskRange,
  visibleTaskInstances,
  editFutureTaskRepeat,
  taskRepeatsOn,
  defaultTaskRepeat,
  type TaskRepeatSettings,
} from './taskRecurrence';
import {
  readTasks,
  writeTasks,
  readTaskStore,
  writeTaskStore,
  validTask,
  type Task,
} from './tasks';
const monday = new Date(2026, 9, 26, 8),
  from = new Date(2026, 9, 26),
  to = new Date(2026, 10, 2);
const base: Task = {
  id: 'original',
  title: 'Task cũ',
  notes: 'Giữ ghi chú',
  group: 'schedule',
  color: '#abcdef',
  completed: false,
  actualOutput: 'Kết quả cũ',
  checklist: [
    {
      id: 'step',
      text: 'Nội dung cũ',
      done: true,
      documents: [
        {
          id: 'doc',
          name: 'Tài liệu cũ',
          url: 'https://docs.google.com/document/d/old',
        },
      ],
    },
  ],
};
const settings = (count?: number): TaskRepeatSettings => ({
  mode: 'weekly',
  startDate: '2026-10-26',
  days: [1, 3, 5],
  ...(count ? { ending: { type: 'count' as const, count } } : {}),
});
const all = (count?: number) => {
  const { root, instance } = createTaskRepeat(
    structuredClone(base),
    settings(count),
  );
  return generateTaskRange(
    [root, instance],
    from,
    new Date(2026, 11, 20),
    new Set(),
    monday,
  );
};
afterEach(() => vi.unstubAllGlobals());
it.each([5, 10, 20])(
  'materializes exactly %i stable dated instances, including missed dates, without Calendar writes',
  (count) => {
    const tasks = all(count);
    expect(tasks.filter((t) => t.repeatSeriesId)).toHaveLength(count);
    expect(tasks.every(validTask)).toBe(true);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(
      generateTaskRange(tasks, from, new Date(2026, 11, 20), new Set(), monday),
    ).toBe(tasks);
    const far = generateTaskRange(
      tasks,
      new Date(2027, 0, 1),
      new Date(2027, 1, 1),
      new Set(),
      monday,
    );
    expect(far).toBe(tasks);
  },
);
it('preserves original ID/progress/documents and resets each new occurrence independently with deep metadata copies', () => {
  const tasks = all(5),
    original = tasks.find((t) => t.id === 'original')!,
    copies = tasks.filter((t) => t.repeatSeriesId && t.id !== 'original');
  expect(original.checklist).toEqual(base.checklist);
  expect(original.actualOutput).toBe('Kết quả cũ');
  expect(
    copies.every(
      (t) =>
        !t.completed && t.status === 'todo' && t.checklist?.[0].done === false,
    ),
  ).toBe(true);
  expect(copies[0].actualOutput).toBeUndefined();
  expect(copies[0].checklist?.[0].documents).toEqual(
    base.checklist![0].documents,
  );
  copies[0].checklist![0].documents![0].name = 'Đổi riêng';
  expect(copies[1].checklist![0].documents![0].name).toBe('Tài liệu cũ');
  expect(base.checklist![0].documents![0].name).toBe('Tài liệu cũ');
});
it('handles nonmatching start dates, inclusive end dates, all seven days, unlimited and no-repeat defaults', () => {
  expect(defaultTaskRepeat().mode).toBe('none');
  const s = {
    ...settings(),
    startDate: '2026-10-27',
    ending: { type: 'date' as const, date: '2026-10-30' },
  };
  const { root, instance } = createTaskRepeat(base, s);
  expect(instance.repeatDate).toBe('2026-10-28');
  expect(
    generateTaskRange([root, instance], from, to, new Set(), monday).filter(
      (t) => t.repeatSeriesId,
    ),
  ).toHaveLength(2);
  const every = createTaskRepeat(base, {
    ...settings(10),
    days: [0, 1, 2, 3, 4, 5, 6],
  });
  expect(
    generateTaskRange(
      [every.root, every.instance],
      from,
      new Date(2026, 10, 20),
      new Set(),
      monday,
    ).filter((t) => t.repeatSeriesId),
  ).toHaveLength(10);
  expect(all().filter((t) => t.repeatSeriesId).length).toBeGreaterThan(20);
});
it('keeps deletion markers, including the original non-deterministic instance ID, when revisiting or changing rules', () => {
  const tasks = all(5).map((t) =>
    t.id === 'original' ? { ...t, deletedAt: 123456 } : t,
  );
  const rebuilt = generateTaskRange(tasks, from, to, new Set(), monday);
  expect(rebuilt).toBe(tasks);
  expect(
    visibleTaskInstances(rebuilt, monday).some((t) => t.id === 'original'),
  ).toBe(false);
  const other = tasks.find((t) => t.repeatDate === '2026-10-28')!;
  const changed = editFutureTaskRepeat(
    tasks,
    other,
    { ...other, title: 'Mới' },
    settings(10),
    new Set(),
    monday,
  );
  expect(changed.find((t) => t.id === 'original')!.deletedAt).toBe(123456);
  expect(changed.filter((t) => t.repeatDate === '2026-10-26')).toHaveLength(1);
});
it('edits only future unmodified instances and preserves history, completed, focused and individually edited work', () => {
  const tasks = all(10);
  const selected = tasks.find((t) => t.repeatDate === '2026-10-28')!;
  const completed = tasks.find((t) => t.repeatDate === '2026-10-30')!;
  completed.completed = true;
  const individual = tasks.find((t) => t.repeatDate === '2026-11-02')!;
  individual.repeatOverride = true;
  individual.notes = 'Riêng';
  const focused = tasks.find((t) => t.repeatDate === '2026-11-04')!;
  const next = editFutureTaskRepeat(
    tasks,
    selected,
    { ...selected, title: 'Các lần sau' },
    settings(10),
    new Set([focused.id]),
    monday,
  );
  expect(next.find((t) => t.id === 'original')).toEqual(
    tasks.find((t) => t.id === 'original'),
  );
  expect(next.find((t) => t.id === completed.id)).toEqual(completed);
  expect(next.find((t) => t.id === focused.id)).toEqual(focused);
  expect(next.find((t) => t.id === individual.id)).toEqual(individual);
  expect(next.find((t) => t.id === selected.id)!.title).toBe('Các lần sau');
  expect(next.find((t) => t.repeatDate === '2026-11-06')!.title).toBe(
    'Các lần sau',
  );
});
it('does not fill years of gaps while editing sparse instances and preserves tombstones on stale writes', () => {
  const { root, instance } = createTaskRepeat(base, settings());
  const future = { ...instance, id: 'far', repeatDate: '2035-01-01' };
  expect(
    editFutureTaskRepeat(
      [root, instance, future],
      instance,
      { ...instance, title: 'Đổi tương lai' },
      settings(),
      new Set(),
      monday,
    ),
  ).toHaveLength(3);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  expect(writeTaskStore([root, { ...instance, deletedAt: 123456 }])).toBe(true);
  expect(writeTasks([instance])).toBe(true);
  expect(
    readTaskStore().tasks.find((t) => t.id === instance.id)!.deletedAt,
  ).toBe(123456);
  expect(readTasks().tasks).toHaveLength(0);
});
it('ending a series retains current/history and stops future instances; invalid limits are rejected', () => {
  const tasks = all(10),
    origin = tasks.find((t) => t.id === 'original')!;
  const stopped = editFutureTaskRepeat(
    tasks,
    origin,
    origin,
    { ...settings(), mode: 'none' },
    new Set(),
    monday,
  );
  const root = stopped.find((t) => t.repeat)!;
  expect(taskRepeatsOn(root.repeat!, '2026-10-26')).toBe(true);
  expect(taskRepeatsOn(root.repeat!, '2026-10-28')).toBe(false);
  expect(visibleTaskInstances(stopped, monday)).toHaveLength(1);
  expect(() => createTaskRepeat(base, { ...settings(), days: [] })).toThrow();
  expect(() =>
    createTaskRepeat(base, {
      ...settings(),
      ending: { type: 'count', count: 0 },
    }),
  ).toThrow();
});
