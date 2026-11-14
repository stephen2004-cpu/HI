import { expect, it } from 'vitest';
import {
  createTaskRepeat,
  generateTaskRange,
  editAllTaskRepeat,
  editFutureTaskRepeat,
  deleteTaskRepeat,
  mergeTaskTombstones,
  visibleTaskInstances,
  repeatSettings,
} from './taskRecurrence';
import { validTask, type Task } from './tasks';
import { scheduleTaskRepeats, visibleTaskBlocks } from './taskScheduling';
import { defaultPlanner } from './planner';
const now = new Date(2026, 10, 14, 6);
const source: Task = {
  id: 'breakfast',
  title: 'Ăn sáng',
  notes: 'Bò né',
  group: 'eliminate',
  color: '#ff77aa',
  completed: false,
  plannedStart: '2026-11-14T07:30',
  plannedEndTime: '08:00',
  repeatSchedule: { time: '07:30', minutes: 30 },
  timing: { mode: 'timer', focusMinutes: 30, focusCount: 1, breakMinutes: 0 },
  checklist: [
    {
      id: 'step',
      text: 'Chuẩn bị',
      done: false,
      documents: [{ id: 'doc', name: 'Gốc', url: 'https://example.com' }],
    },
  ],
};
const independent: Task = {
  ...source,
  id: 'independent',
  title: 'Task độc lập',
};
const settings = {
  mode: 'weekly' as const,
  startDate: '2026-11-14',
  days: [0, 1, 2, 3, 4, 5, 6],
  ending: { type: 'count' as const, count: 10 },
};
function fixture() {
  const { root, instance } = createTaskRepeat(
    structuredClone(source),
    settings,
  );
  const tasks = generateTaskRange(
    [root, instance, structuredClone(independent)],
    new Date(2026, 10, 14),
    new Date(2026, 10, 17),
    new Set(),
    now,
  );
  return { root, instance, tasks };
}
it('deletes one occurrence or all materialized dates/root without deleting unrelated records or generating future dates', () => {
  const { tasks, root, instance } = fixture();
  const single = deleteTaskRepeat(tasks, instance, 'single', 1800000000000);
  expect(single.filter((t) => t.deletedAt)).toHaveLength(1);
  expect(single.find((t) => t.id === root.id)).toEqual(root);
  const all = deleteTaskRepeat(tasks, instance, 'all', 1800000000000);
  expect(all).toHaveLength(tasks.length);
  expect(all.find((t) => t.id === 'independent')).toEqual(independent);
  expect(
    all
      .filter((t) => t.id === root.id || t.repeatSeriesId === root.id)
      .every((t) => t.deletedAt === 1800000000000),
  ).toBe(true);
  expect(all.every(validTask)).toBe(true);
  expect(visibleTaskInstances(all, now).map((t) => t.id)).toEqual([
    'independent',
  ]);
  expect(
    generateTaskRange(
      all,
      new Date(2026, 10, 17),
      new Date(2026, 10, 25),
      new Set(),
      now,
    ),
  ).toBe(all);
  expect(tasks.some((t) => t.deletedAt)).toBe(false);
});
it('a durable root tombstone suppresses unseen dates from stale snapshots and keeps earlier instance tombstones immutable', () => {
  const { root, instance, tasks } = fixture();
  const rootMarker = { ...root, deletedAt: 1800000000000 };
  const staleFuture = {
    ...instance,
    id: 'stale-future',
    repeatDate: '2030-01-01',
    repeatOverride: true,
    completed: true,
  };
  const oldMarker = { ...instance, deletedAt: 1700000000000 };
  const merged = mergeTaskTombstones(
    [...tasks, staleFuture],
    [rootMarker, oldMarker],
  );
  expect(merged.find((t) => t.id === instance.id)?.deletedAt).toBe(
    1700000000000,
  );
  expect(merged.find((t) => t.id === staleFuture.id)?.deletedAt).toBe(
    1800000000000,
  );
  expect(
    visibleTaskInstances(
      [...tasks.filter((t) => t.id !== root.id), staleFuture, rootMarker],
      now,
      new Set([staleFuture.id]),
    ).map((t) => t.id),
  ).toEqual(['independent']);
});
it('all-series color/name changes patch only edited fields, preserve per-date progress/private notes and apply to future generated tasks', () => {
  const { tasks, root, instance } = fixture();
  const other = tasks.find(
    (t) => t.repeatSeriesId === root.id && t.id !== instance.id,
  )!;
  const modified = tasks.map((t) =>
    t.id === other.id
      ? {
          ...t,
          notes: 'Ghi chú riêng',
          completed: true,
          status: 'done' as const,
          actualOutput: 'Đã làm',
          checklist: [{ ...t.checklist![0], done: true }],
        }
      : t,
  );
  const next = editAllTaskRepeat(
    modified,
    instance,
    { ...instance, color: '#123456', title: 'Bữa sáng' },
    settings,
  );
  const nextOther = next.find((t) => t.id === other.id)!;
  expect(nextOther).toMatchObject({
    color: '#123456',
    title: 'Bữa sáng',
    notes: 'Ghi chú riêng',
    completed: true,
    status: 'done',
    actualOutput: 'Đã làm',
    repeatDate: other.repeatDate,
  });
  expect(nextOther.checklist).toEqual(
    modified.find((t) => t.id === other.id)!.checklist,
  );
  expect(next.find((t) => t.id === 'independent')).toEqual(independent);
  expect(next.every(validTask)).toBe(true);
  const future = generateTaskRange(
    next,
    new Date(2026, 10, 17),
    new Date(2026, 10, 25),
    new Set(),
    now,
  );
  expect(
    future
      .filter((t) => t.repeatSeriesId === root.id)
      .every((t) => t.color === '#123456'),
  ).toBe(true);
  expect(future.filter((t) => t.repeatSeriesId === root.id)).toHaveLength(10);
});
it('shared checklist edits keep each date done state, private steps/documents and completed historical checklists', () => {
  const { tasks, root, instance } = fixture();
  const others = tasks.filter(
    (t) => t.repeatSeriesId === root.id && t.id !== instance.id,
  );
  const nextTasks = tasks.map((t) =>
    t.id === others[0].id
      ? {
          ...t,
          checklist: [
            {
              ...t.checklist![0],
              done: true,
              documents: [
                ...t.checklist![0].documents!,
                { id: 'private', name: 'Riêng', url: 'https://example.org' },
              ],
            },
            { id: 'private-step', text: 'Bước riêng', done: true },
          ],
        }
      : t.id === others[1].id
        ? { ...t, completed: true }
        : t,
  );
  const draft = {
    ...instance,
    checklist: [
      {
        ...instance.checklist![0],
        text: 'Chuẩn bị mới',
        documents: [
          { id: 'doc', name: 'Đổi tên gốc', url: 'https://example.com' },
        ],
      },
    ],
  };
  const next = editAllTaskRepeat(nextTasks, instance, draft, settings);
  expect(next.find((t) => t.id === others[0].id)?.checklist).toEqual([
    {
      ...draft.checklist[0],
      done: true,
      documents: [
        ...draft.checklist[0].documents,
        { id: 'private', name: 'Riêng', url: 'https://example.org' },
      ],
    },
    { id: 'private-step', text: 'Bước riêng', done: true },
  ]);
  expect(next.find((t) => t.id === others[1].id)?.checklist).toEqual(
    nextTasks.find((t) => t.id === others[1].id)?.checklist,
  );
});
it('a shared color edit keeps ordinary future occurrences eligible for later future-only edits', () => {
  const { tasks, instance, root } = fixture();
  const colored = editAllTaskRepeat(
    tasks,
    instance,
    { ...instance, color: '#123456' },
    settings,
  );
  expect(
    colored
      .filter((t) => t.repeatSeriesId === root.id && t.id !== instance.id)
      .every((t) => !t.repeatOverride),
  ).toBe(true);
  const updated = editFutureTaskRepeat(
    colored,
    colored.find((t) => t.id === instance.id)!,
    { ...instance, color: '#123456', title: 'Tên tương lai' },
    settings,
    new Set(),
    now,
  );
  expect(
    updated
      .filter(
        (t) =>
          t.repeatSeriesId === root.id && t.repeatDate! > instance.repeatDate!,
      )
      .every((t) => t.title === 'Tên tương lai'),
  ).toBe(true);
});
it('time changes keep independent dates and protected Focus timing, and do not apply completion/results to other occurrences', () => {
  const { tasks, root, instance } = fixture();
  const other = tasks.find(
    (t) => t.repeatSeriesId === root.id && t.id !== instance.id,
  )!;
  const planned = tasks.map((t) =>
    t.id === other.id ? { ...t, plannedStart: `${t.repeatDate}T07:30` } : t,
  );
  const draft = {
    ...instance,
    repeatSchedule: { time: '09:00', minutes: 30 },
    plannedStart: '2026-11-14T09:00',
    completed: true,
    status: 'done' as const,
    actualOutput: 'Kết quả riêng',
  };
  const next = editAllTaskRepeat(
    planned,
    instance,
    draft,
    settings,
    new Set([other.id]),
  );
  expect(next.find((t) => t.id === other.id)?.plannedStart).toBe(
    `${other.repeatDate}T07:30`,
  );
  expect(next.find((t) => t.id === other.id)?.repeatSchedule).toEqual(
    source.repeatSchedule,
  );
  expect(next.find((t) => t.id === instance.id)).toMatchObject({
    completed: true,
    actualOutput: 'Kết quả riêng',
  });
  expect(
    next
      .filter((t) => t.repeatSeriesId === root.id && t.id !== instance.id)
      .every((t) => !t.completed && !t.actualOutput),
  ).toBe(true);
});
it('series deletion cancels all linked manual/automatic blocks while retaining raw blocks and unrelated Calendar data', () => {
  const { tasks, instance } = fixture();
  const before = scheduleTaskRepeats(
    tasks,
    structuredClone(defaultPlanner),
    new Date(2026, 10, 14),
    new Date(2026, 10, 21),
    new Set(),
    now,
  );
  const planner = {
    ...before.planner,
    blocks: [
      ...before.planner.blocks,
      {
        id: 'manual',
        taskId: instance.id,
        title: 'Lịch riêng',
        color: '',
        start: +new Date(2026, 10, 14, 12),
        end: +new Date(2026, 10, 14, 13),
      },
      {
        id: 'keep',
        taskId: 'independent',
        title: 'Giữ',
        color: '',
        start: +new Date(2026, 10, 14, 14),
        end: +new Date(2026, 10, 14, 15),
      },
    ],
  };
  const after = scheduleTaskRepeats(
    deleteTaskRepeat(before.tasks, instance, 'all'),
    planner,
    new Date(2026, 10, 14),
    new Date(2026, 10, 21),
    new Set([instance.id]),
    now,
  );
  expect(after.planner.blocks).toHaveLength(planner.blocks.length);
  expect(
    after.planner.blocks
      .filter((b) => b.id !== 'keep')
      .every((b) => b.cancelled),
  ).toBe(true);
  expect(
    visibleTaskBlocks(after.planner.blocks, after.tasks, new Set(), now).map(
      (b) => b.id,
    ),
  ).toEqual(['keep']);
});
it('cannot edit a deleted series, and preserves the input when the series/root/settings are invalid', () => {
  const { tasks, instance } = fixture();
  const deleted = deleteTaskRepeat(tasks, instance, 'all');
  expect(() =>
    editAllTaskRepeat(
      deleted,
      instance,
      { ...instance, color: '#123456' },
      settings,
    ),
  ).toThrow('đã xóa');
  expect(() => deleteTaskRepeat([instance], instance, 'all')).toThrow('chuỗi');
  expect(() =>
    editAllTaskRepeat(tasks, instance, instance, { ...settings, days: [] }),
  ).toThrow('hợp lệ');
  expect(
    repeatSettings(
      tasks.find((t) => t.repeat),
      instance.repeatDate,
    ),
  ).toEqual(settings);
});
