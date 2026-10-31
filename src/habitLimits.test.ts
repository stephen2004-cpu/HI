import { expect, it } from 'vitest';
import {
  habitOccurrence,
  setHabitSchedule,
  recurrenceState,
  pauseHabit,
  resumeHabit,
  validHabit,
  cycleLog,
  habitProgress,
  type Habit,
  type HabitEnding,
} from './habits';
import { generateHabitRange, visibleHabitBlocks } from './recurrence';
import { defaultPlanner, addDays } from './planner';
const base: Habit = {
  id: 'gym',
  name: 'GYM',
  category: 'Sức khỏe',
  days: [1, 3, 5],
  weeklyTarget: 3,
  minutes: 30,
  archived: false,
  logs: {},
};
const start = new Date(2026, 9, 26, 8);
const scheduled = (
  ending?: HabitEnding,
  days = [1, 3, 5],
  date = '2026-10-26',
) => setHabitSchedule({ ...base, days }, date, '09:00', start, ending);
const dates = (h: Habit, from = new Date(2026, 9, 26), length = 50) =>
  Array.from({ length }, (_, i) => addDays(from, i))
    .map(
      (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
    .filter((d) => habitOccurrence(h, d));
it.each([5, 10, 20])(
  'caps lifetime scheduled appearances at %i even with no completions or previously visited Calendar ranges',
  (count) => {
    const h = scheduled({ type: 'count', count });
    expect(dates(h)).toHaveLength(count);
    const far = generateHabitRange(
      [h],
      defaultPlanner,
      [],
      new Date(2027, 0, 1),
      new Date(2027, 1, 1),
      new Set(),
      +start,
    );
    expect(far.planner.blocks).toHaveLength(0);
    expect(h.logs).toEqual({});
    expect(validHabit(h)).toBe(true);
  },
);
it('six M/W/F slots span two weeks; a nonmatching Tuesday start begins on Wednesday', () => {
  expect(dates(scheduled({ type: 'count', count: 6 }))).toEqual([
    '2026-10-26',
    '2026-10-28',
    '2026-10-30',
    '2026-11-02',
    '2026-11-04',
    '2026-11-06',
  ]);
  expect(
    dates(scheduled({ type: 'count', count: 5 }, [1, 3, 5], '2026-10-27')),
  ).toEqual([
    '2026-10-28',
    '2026-10-30',
    '2026-11-02',
    '2026-11-04',
    '2026-11-06',
  ]);
});
it('supports one weekday, all seven weekdays, unlimited legacy rules and inclusive date endings', () => {
  expect(dates(scheduled({ type: 'count', count: 5 }, [2]))).toHaveLength(5);
  expect(
    dates(scheduled({ type: 'count', count: 10 }, [0, 1, 2, 3, 4, 5, 6])),
  ).toHaveLength(10);
  expect(dates(scheduled())).toHaveLength(22);
  expect(dates(scheduled({ type: 'date', date: '2026-11-02' }))).toEqual([
    '2026-10-26',
    '2026-10-28',
    '2026-10-30',
    '2026-11-02',
  ]);
  expect(dates(scheduled({ type: 'date', date: '2026-11-01' }))).toHaveLength(
    3,
  );
});
it('extends an exhausted cap without resetting prior scheduled counts, logs or stable Calendar IDs', () => {
  const h = {
    ...scheduled({ type: 'count', count: 5 }),
    logs: { '2026-10-26': 'done' as const },
  };
  expect(recurrenceState(h, new Date(2026, 10, 20))).toBe('ended');
  const next = setHabitSchedule(
    h,
    '2026-10-26',
    '09:00',
    new Date(2026, 10, 20),
    { type: 'count', count: 10 },
  );
  expect(dates(next, new Date(2026, 10, 20), 30)).toHaveLength(5);
  expect(next.logs).toEqual(h.logs);
  expect(next.recurrence!.endedAt).toBeUndefined();
  const a = generateHabitRange(
    [next],
    defaultPlanner,
    [],
    new Date(2026, 9, 26),
    new Date(2026, 11, 20),
    new Set(),
    +start,
  );
  const b = generateHabitRange(
    [next],
    a.planner,
    a.tasks,
    new Date(2026, 9, 26),
    new Date(2026, 11, 20),
    new Set(),
    +start,
  );
  expect(a.planner.blocks).toHaveLength(10);
  expect(b.tasksChanged).toBe(false);
  expect(b.blocksChanged).toBe(false);
});
it('changes weekdays/caps prospectively and retains completion history while hiding obsolete uncompleted future blocks', () => {
  const old = {
    ...scheduled({ type: 'count', count: 10 }),
    logs: { '2026-10-26': 'done' as const },
  };
  const built = generateHabitRange(
    [old],
    defaultPlanner,
    [],
    new Date(2026, 9, 26),
    new Date(2026, 10, 25),
    new Set(),
    +start,
  );
  const next = setHabitSchedule(
    { ...old, days: [2, 4] },
    '2026-10-26',
    '09:00',
    new Date(2026, 10, 4, 8),
    { type: 'count', count: 6 },
  );
  expect(habitOccurrence(next, '2026-11-04')).toBeUndefined();
  expect(dates(next)).toEqual([
    '2026-10-26',
    '2026-10-28',
    '2026-10-30',
    '2026-11-02',
    '2026-11-05',
    '2026-11-10',
  ]);
  const refreshed = generateHabitRange(
    [next],
    built.planner,
    built.tasks,
    new Date(2026, 9, 26),
    new Date(2026, 10, 25),
    new Set(),
    +new Date(2026, 10, 4, 8),
  );
  expect(new Set(refreshed.planner.blocks.map((b) => b.id)).size).toBe(
    refreshed.planner.blocks.length,
  );
  expect(
    visibleHabitBlocks(
      refreshed.planner.blocks,
      [next],
      new Set(),
      +new Date(2026, 10, 4, 8),
    ),
  ).toHaveLength(6);
  expect(next.logs).toEqual(old.logs);
  expect(
    cycleLog(next, '2026-10-26', new Date(2026, 10, 4)).logs['2026-10-26'],
  ).toBe('rest');
  expect(habitProgress(next, new Date(2026, 9, 26)).weekDone).toBe(1);
});
it('pauses do not consume slots, missed dates do, reducing a cap below history ends only future scheduling', () => {
  let h = scheduled({ type: 'count', count: 5 });
  h = pauseHabit(h, +new Date(2026, 9, 27));
  h = resumeHabit(h, +new Date(2026, 10, 2, 9));
  expect(dates(h)).toEqual([
    '2026-10-26',
    '2026-11-02',
    '2026-11-04',
    '2026-11-06',
    '2026-11-09',
  ]);
  const reduced = setHabitSchedule(
    scheduled({ type: 'count', count: 10 }),
    '2026-10-26',
    '09:00',
    new Date(2026, 10, 10),
    { type: 'count', count: 5 },
  );
  expect(dates(reduced, new Date(2026, 10, 10), 20)).toHaveLength(0);
  expect(recurrenceState(reduced, new Date(2026, 10, 10))).toBe('ended');
});
it('tracking-only finite rules do not generate automatic Calendar blocks and old records remain valid', () => {
  const h = scheduled({ type: 'count', count: 5 });
  h.recurrence!.trackingOnly = true;
  expect(dates(h)).toHaveLength(5);
  expect(
    generateHabitRange(
      [h],
      defaultPlanner,
      [],
      new Date(2026, 9, 26),
      new Date(2026, 10, 20),
      new Set(),
      +start,
    ).planner.blocks,
  ).toHaveLength(0);
  expect(validHabit(base)).toBe(true);
  expect(
    validHabit({
      ...h,
      recurrence: {
        ...h.recurrence!,
        rules: [
          { ...h.recurrence!.rules[0], ending: { type: 'count', count: 0 } },
        ],
      },
    }),
  ).toBe(false);
  expect(
    validHabit({
      ...h,
      recurrence: {
        ...h.recurrence!,
        rules: [
          {
            ...h.recurrence!.rules[0],
            ending: { type: 'date', date: '2026-10-25' },
          },
        ],
      },
    }),
  ).toBe(false);
});
it('does not rewrite an occurrence that already started today when editing its rule', () => {
  const h = {
    ...scheduled({ type: 'count', count: 6 }),
    logs: { '2026-10-26': 'done' as const },
  };
  const next = setHabitSchedule(
    { ...h, days: [2, 4] },
    '2026-10-26',
    '09:00',
    new Date(2026, 9, 26, 10),
    { type: 'count', count: 5 },
  );
  expect(next.recurrence!.rules.at(-1)!.effectiveDate).toBe('2026-10-27');
  expect(habitOccurrence(next, '2026-10-26')).toBeDefined();
  expect(dates(next)).toEqual([
    '2026-10-26',
    '2026-10-27',
    '2026-10-29',
    '2026-11-03',
    '2026-11-05',
  ]);
  expect(next.logs).toEqual(h.logs);
});
it('counts local dates consistently across a daylight-saving transition', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const h = scheduled(
      { type: 'count', count: 4 },
      [0, 1, 2, 3, 4, 5, 6],
      '2026-10-30',
    );
    const occurrences = dates(h, new Date(2026, 9, 30), 7).map((d) =>
      habitOccurrence(h, d)!,
    );
    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((o) => new Date(o.start).getHours())).toEqual([
      9, 9, 9, 9,
    ]);
    expect(occurrences[2].start - occurrences[1].start).toBe(25 * 3600000);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
