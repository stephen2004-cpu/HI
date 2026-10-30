import { expect, it } from 'vitest';
import {
  endHabit,
  archiveHabit,
  restoreHabit,
  recurrenceState,
  habitOccurrence,
  localDate,
  pauseHabit,
  resumeHabit,
  setHabitSchedule,
  type Habit,
} from './habits';
import {
  applyCalendarEdit,
  generateHabitRange,
  visibleHabitBlocks,
} from './recurrence';
import { defaultPlanner } from './planner';
const monday = new Date(2026, 9, 26),
  now = +new Date(2026, 9, 26, 8);
const base: Habit = {
  id: 'h',
  name: 'Đọc',
  category: 'Học tập',
  days: [1, 3, 5],
  weeklyTarget: 3,
  minutes: 40,
  archived: false,
  logs: {},
};
const habit = () => setHabitSchedule(base, '2026-10-26', '18:30', monday);
it('repeats by local weekdays across multiple weeks and months, idempotently', () => {
  const h = habit(),
    a = generateHabitRange(
      [h],
      defaultPlanner,
      [],
      monday,
      new Date(2026, 10, 2),
      new Set(),
      now,
    );
  expect(a.planner.blocks).toHaveLength(3);
  expect(new Date(a.planner.blocks[0].start).getHours()).toBe(18);
  expect(a.planner.blocks[0].end - a.planner.blocks[0].start).toBe(40 * 60000);
  const b = generateHabitRange(
    [h],
    a.planner,
    a.tasks,
    monday,
    new Date(2026, 10, 2),
    new Set(),
    now,
  );
  expect(b.blocksChanged).toBe(false);
  expect(b.tasksChanged).toBe(false);
  const c = generateHabitRange(
    [h],
    b.planner,
    b.tasks,
    new Date(2026, 10, 2),
    new Date(2026, 10, 9),
    new Set(),
    now,
  );
  expect(c.planner.blocks).toHaveLength(6);
  expect(new Set(c.planner.blocks.map((b) => b.id)).size).toBe(6);
  const d = generateHabitRange(
    [h],
    c.planner,
    c.tasks,
    new Date(2027, 0, 4),
    new Date(2027, 0, 11),
    new Set(),
    now,
  );
  expect(d.planner.blocks).toHaveLength(9);
});
it('pause/resume preserves recorded instances and does not backfill the paused interval', () => {
  const h = habit(),
    a = generateHabitRange(
      [h],
      defaultPlanner,
      [],
      monday,
      new Date(2026, 10, 2),
      new Set(),
      now,
    ),
    paused = pauseHabit(h, now);
  expect(
    visibleHabitBlocks(a.planner.blocks, [paused], new Set(), now),
  ).toHaveLength(0);
  expect(
    visibleHabitBlocks(
      a.planner.blocks,
      [paused],
      new Set([a.tasks[0].id]),
      now,
    ),
  ).toHaveLength(1);
  const resumed = resumeHabit(paused, +new Date(2026, 9, 28, 20));
  expect(habitOccurrence(resumed, '2026-10-26')).toBeUndefined();
  expect(habitOccurrence(resumed, '2026-10-28')).toBeUndefined();
  expect(habitOccurrence(resumed, '2026-10-30')).toBeDefined();
  expect(
    visibleHabitBlocks(
      a.planner.blocks,
      [resumed],
      new Set(),
      +new Date(2026, 9, 29),
    ),
  ).toHaveLength(1);
  expect(a.planner.blocks).toHaveLength(3);
  const ended = endHabit(resumed, +new Date(2026, 9, 29));
  expect(habitOccurrence(ended, '2026-10-30')).toBeUndefined();
  expect(resumeHabit(ended)).toBe(ended);
});
it('retains past schedule snapshots while new revisions change future times', () => {
  const h = habit(),
    a = generateHabitRange(
      [h],
      defaultPlanner,
      [],
      monday,
      new Date(2026, 10, 2),
      new Set(),
      now,
    );
  const changed = setHabitSchedule(
    { ...h, minutes: 50 },
    '2026-10-26',
    '19:15',
    new Date(2026, 9, 28, 8),
  );
  expect(
    new Date(habitOccurrence(changed, '2026-10-26')!.start).getMinutes(),
  ).toBe(30);
  expect(
    new Date(habitOccurrence(changed, '2026-10-28')!.start).getMinutes(),
  ).toBe(15);
  const b = generateHabitRange(
    [changed],
    a.planner,
    a.tasks,
    monday,
    new Date(2026, 10, 2),
    new Set([a.tasks[1].id]),
    +new Date(2026, 9, 28, 8),
  );
  expect(b.planner.blocks[0]).toEqual(a.planner.blocks[0]);
  expect(b.planner.blocks[1]).toEqual(a.planner.blocks[1]);
  expect(b.planner.blocks[2].end - b.planner.blocks[2].start).toBe(50 * 60000);
});
it('keeps hidden blocks, per-occurrence edits and deletion exceptions without regeneration', () => {
  const h = habit(),
    a = generateHabitRange(
      [h],
      defaultPlanner,
      [],
      monday,
      new Date(2026, 10, 2),
      new Set(),
      now,
    );
  const visible = [a.planner.blocks[0]],
    edited = applyCalendarEdit(a.planner, visible, {
      ...a.planner,
      blocks: [
        {
          ...visible[0],
          start: visible[0].start + 3600000,
          end: visible[0].end + 3600000,
        },
      ],
    });
  expect(edited.blocks).toHaveLength(3);
  expect(edited.blocks.find((b) => b.id === visible[0].id)?.habitOverride).toBe(
    true,
  );
  const deletion = applyCalendarEdit(a.planner, a.planner.blocks, {
    ...a.planner,
    blocks: a.planner.blocks.slice(1),
  });
  expect(deletion.blocks).toHaveLength(3);
  expect(deletion.blocks.find((b) => b.id === visible[0].id)?.cancelled).toBe(
    true,
  );
  expect(
    generateHabitRange(
      [h],
      deletion,
      a.tasks,
      monday,
      new Date(2026, 10, 2),
      new Set(),
      now,
    ).blocksChanged,
  ).toBe(false);
  expect(localDate(new Date(a.planner.blocks[0].start))).toBe('2026-10-26');
});

it('restoring an archive respects a pre-existing user pause and never restarts an ended series', () => {
  const h = habit();
  expect(recurrenceState(restoreHabit(archiveHabit(h, now), now + 1000))).toBe(
    'active',
  );
  const paused = pauseHabit(h, now);
  expect(
    recurrenceState(restoreHabit(archiveHabit(paused, now + 1000), now + 2000)),
  ).toBe('paused');
  const ended = endHabit(h, now);
  expect(
    recurrenceState(restoreHabit(archiveHabit(ended, now + 1000), now + 2000)),
  ).toBe('ended');
});

it('never regenerates deleted habits and hides future automatic blocks even for protected task IDs, retaining past focus blocks', async () => {
  const { deleteHabit } = await import('./habits');
  const h = habit();
  const generated = generateHabitRange(
    [h],
    defaultPlanner,
    [],
    monday,
    new Date(2026, 10, 2),
    new Set(),
    now,
  );
  const dead = deleteHabit(h, false, generated.planner.blocks[0].end + 1);
  const visible = visibleHabitBlocks(
    generated.planner.blocks,
    [dead],
    new Set(generated.tasks.map((t) => t.id)),
    now,
  );
  expect(visible).toHaveLength(1);
  const later = generateHabitRange(
    [dead],
    generated.planner,
    generated.tasks,
    new Date(2026, 10, 2),
    new Date(2026, 10, 9),
    new Set(),
    now,
  );
  expect(later.tasksChanged).toBe(false);
  expect(later.blocksChanged).toBe(false);
});

it('does not resurrect an explicitly deleted source task when its calendar evidence remains', () => {
  const h = habit(),
    first = generateHabitRange(
      [h],
      defaultPlanner,
      [],
      monday,
      new Date(2026, 10, 2),
      new Set(),
      now,
    );
  const removedId = first.tasks[0].id;
  const again = generateHabitRange(
    [h],
    first.planner,
    first.tasks.filter((t) => t.id !== removedId),
    monday,
    new Date(2026, 10, 2),
    new Set(),
    now,
  );
  expect(again.tasks.some((t) => t.id === removedId)).toBe(false);
  expect(again.tasksChanged).toBe(false);
  expect(again.planner.blocks).toEqual(first.planner.blocks);
});
