import type { Task } from './tasks';
import { allowedByEnding, type HabitEnding } from './habitLimits';
import { localDate, validDate } from './habits';
import { addDays, dayStart } from './planner';
export type TaskTemplate = Pick<
  Task,
  | 'title'
  | 'notes'
  | 'group'
  | 'color'
  | 'checklist'
  | 'expectedOutput'
  | 'timing'
  | 'repeatSchedule'
  | 'plannedEndTime'
>;
export type TaskRepeatRule = {
  id: string;
  effectiveDate: string;
  startDate: string;
  days: number[];
  enabled: boolean;
  ending?: HabitEnding;
  template: TaskTemplate;
};
export type TaskRepeat = { rules: TaskRepeatRule[] };
export type TaskRepeatSettings = {
  mode: 'none' | 'weekly';
  startDate: string;
  days: number[];
  ending?: HabitEnding;
};
export const defaultTaskRepeat = (): TaskRepeatSettings => ({
  mode: 'none',
  startDate: localDate(new Date()),
  days: [new Date().getDay()],
});
export const repeatInstanceId = (series: string, date: string) =>
  `task-repeat:${series}:${date}`;
const templateKeys = [
  'title',
  'notes',
  'group',
  'color',
  'checklist',
  'expectedOutput',
  'timing',
  'repeatSchedule',
  'plannedEndTime',
];
export function taskTemplate(task: Task): TaskTemplate {
  const value = Object.fromEntries(
    templateKeys
      .filter((k) => task[k as keyof Task] !== undefined)
      .map((k) => [k, structuredClone(task[k as keyof Task])]),
  ) as TaskTemplate;
  if (value.checklist)
    value.checklist = value.checklist.map((s) => ({ ...s, done: false }));
  return value;
}
export function validTaskRepeat(
  value: TaskRepeat,
  validate: (t: unknown) => boolean,
): boolean {
  return (
    !!value &&
    Array.isArray(value.rules) &&
    value.rules.length > 0 &&
    new Set(value.rules.map((r) => r.id)).size === value.rules.length &&
    value.rules.every(
      (r) =>
        r &&
        typeof r.id === 'string' &&
        !!r.id &&
        validDate(r.effectiveDate) &&
        validDate(r.startDate) &&
        typeof r.enabled === 'boolean' &&
        Array.isArray(r.days) &&
        r.days.length > 0 &&
        new Set(r.days).size === r.days.length &&
        r.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
        (r.ending === undefined ||
          (r.ending &&
            (r.ending.type === 'count'
              ? Number.isSafeInteger(r.ending.count) && r.ending.count > 0
              : r.ending.type === 'date' &&
                validDate(r.ending.date) &&
                r.ending.date >= r.startDate))) &&
        r.template &&
        Object.keys(r.template).every((k) => templateKeys.includes(k)) &&
        validate({ ...r.template, id: 'template', completed: false }),
    )
  );
}
export const repeatRule = (repeat: TaskRepeat, date: string) =>
  [...repeat.rules]
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .filter((r) => r.effectiveDate <= date)
    .at(-1);
export function taskRepeatsOn(repeat: TaskRepeat, date: string) {
  if (!validDate(date)) return false;
  return allowedByEnding(
    {
      rules: repeat.rules.map((r) => ({
        ...r,
        time: '12:00',
        minutes: 1,
        days: r.enabled ? r.days : [],
      })),
      pauses: [],
    },
    date,
  );
}
export function repeatSettings(
  root?: Task,
  date = localDate(new Date()),
): TaskRepeatSettings {
  const r = root?.repeat
    ? (repeatRule(root.repeat, date) ?? root.repeat.rules.at(-1))
    : undefined;
  return r
    ? {
        mode: r.enabled ? 'weekly' : 'none',
        startDate: r.startDate,
        days: [...r.days],
        ...(r.ending ? { ending: structuredClone(r.ending) } : {}),
      }
    : defaultTaskRepeat();
}
export function repeatSettingsValid(s: TaskRepeatSettings) {
  return (
    s.mode === 'none' ||
    (validDate(s.startDate) &&
      s.days.length > 0 &&
      new Set(s.days).size === s.days.length &&
      s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
      (!s.ending ||
        (s.ending.type === 'count'
          ? Number.isSafeInteger(s.ending.count) && s.ending.count > 0
          : s.ending.type === 'date' &&
            validDate(s.ending.date) &&
            s.ending.date >= s.startDate)))
  );
}
function rule(
  settings: TaskRepeatSettings,
  template: TaskTemplate,
  effectiveDate = settings.startDate,
): TaskRepeatRule {
  return {
    id: crypto.randomUUID(),
    effectiveDate,
    startDate: settings.startDate,
    days: [...settings.days],
    enabled: settings.mode === 'weekly',
    ...(settings.ending ? { ending: structuredClone(settings.ending) } : {}),
    template,
  };
}
export function previewTaskRepeat(
  settings: TaskRepeatSettings,
  repeat?: TaskRepeat,
  effectiveDate = settings.startDate,
) {
  if (settings.mode === 'none' || !repeatSettingsValid(settings)) return [];
  const proposed = {
    rules: [
      ...(repeat?.rules ?? []),
      rule(settings, {} as TaskTemplate, effectiveDate),
    ],
  };
  const dates: string[] = [];
  let day = new Date(
    `${settings.startDate > effectiveDate ? settings.startDate : effectiveDate}T12:00:00`,
  );
  for (let i = 0; i < 370 && dates.length < 6; i++, day = addDays(day, 1)) {
    const date = localDate(day);
    if (taskRepeatsOn(proposed, date)) dates.push(date);
  }
  return dates;
}
export function createTaskRepeat(task: Task, settings: TaskRepeatSettings) {
  if (!repeatSettingsValid(settings) || settings.mode !== 'weekly')
    throw Error('Chọn ngày lặp và giới hạn hợp lệ.');
  const repeat = { rules: [rule(settings, taskTemplate(task))] },
    first = previewTaskRepeat(settings)[0];
  if (!first) throw Error('Khoảng lặp không có ngày xuất hiện phù hợp.');
  const root: Task = {
    ...structuredClone(taskTemplate(task)),
    id: `task-series:${crypto.randomUUID()}`,
    completed: false,
    repeat,
  };
  const instance: Task = {
    ...task,
    repeatSeriesId: root.id,
    repeatDate: first,
    ...(task.repeatSchedule && task.plannedStart
      ? { plannedStart: `${first}T${task.repeatSchedule.time}` }
      : {}),
    repeatOverride: true,
  };
  return { root, instance };
}
export function mergeTaskTombstones(local: Task[], remote: Task[]) {
  const dead = new Map(
    [...local, ...remote]
      .filter((t) => t.deletedAt !== undefined)
      .map((t) => [t.id, t]),
  );
  return [
    ...local.map((t) => dead.get(t.id) ?? t),
    ...[...dead.values()].filter((t) => !local.some((x) => x.id === t.id)),
  ];
}
export function visibleTaskInstances(
  tasks: Task[],
  now = new Date(),
  protectedIds = new Set<string>(),
) {
  const roots = new Map(tasks.filter((t) => t.repeat).map((t) => [t.id, t]));
  const today = localDate(now);
  return tasks.filter(
    (t) =>
      !t.repeat &&
      t.deletedAt === undefined &&
      (!t.repeatSeriesId ||
        !t.repeatDate ||
        !roots.get(t.repeatSeriesId)?.repeat ||
        t.completed ||
        protectedIds.has(t.id) ||
        t.repeatDate < today ||
        (!!repeatRule(roots.get(t.repeatSeriesId)!.repeat!, t.repeatDate)
          ?.enabled &&
          (t.repeatOverride ||
            taskRepeatsOn(
              roots.get(t.repeatSeriesId)!.repeat!,
              t.repeatDate,
            )))),
  );
}
export function generateTaskRange(
  tasks: Task[],
  from: Date,
  to: Date,
  protectedIds = new Set<string>(),
  now = new Date(),
  seriesIds?: Set<string>,
) {
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    +to <= +from ||
    +to - +from > 62 * 86400000
  )
    return tasks;
  const next = [...tasks];
  let changed = false;
  const today = localDate(now);
  for (const root of tasks.filter(
    (t) =>
      t.repeat &&
      t.deletedAt === undefined &&
      (!seriesIds || seriesIds.has(t.id)),
  ))
    for (let day = dayStart(from); +day < +to; day = addDays(day, 1)) {
      const date = localDate(day);
      if (!taskRepeatsOn(root.repeat!, date)) continue;
      const r = repeatRule(root.repeat!, date)!;
      const index = next.findIndex(
          (t) => t.repeatSeriesId === root.id && t.repeatDate === date,
        ),
        existing = next[index];
      if (existing) {
        if (
          existing.deletedAt !== undefined ||
          existing.completed ||
          existing.repeatOverride ||
          protectedIds.has(existing.id) ||
          date < today
        )
          continue;
        const updated = {
          ...existing,
          ...structuredClone(r.template),
          completed: false,
          status: 'todo' as const,
        };
        if (JSON.stringify(updated) !== JSON.stringify(existing)) {
          next[index] = updated;
          changed = true;
        }
      } else {
        next.push({
          ...structuredClone(r.template),
          id: repeatInstanceId(root.id, date),
          repeatSeriesId: root.id,
          repeatDate: date,
          completed: false,
          status: 'todo',
        });
        changed = true;
      }
    }
  return changed ? next : tasks;
}
export function futureTaskEffectiveDate(
  instance: Task,
  protectedIds = new Set<string>(),
  now = new Date(),
) {
  const tomorrow = localDate(addDays(now, 1));
  const from =
    instance.repeatDate && instance.repeatDate > tomorrow
      ? instance.repeatDate
      : tomorrow;
  return instance.repeatDate === from &&
    (instance.completed || protectedIds.has(instance.id))
    ? localDate(addDays(new Date(`${from}T12:00:00`), 1))
    : from;
}
export function editFutureTaskRepeat(
  tasks: Task[],
  instance: Task,
  draft: Task,
  settings: TaskRepeatSettings,
  protectedIds = new Set<string>(),
  now = new Date(),
) {
  const root = tasks.find((t) => t.id === instance.repeatSeriesId && t.repeat);
  if (!root?.repeat)
    throw Error('Không đọc được chuỗi Task. Chưa lưu thay đổi.');
  if (!repeatSettingsValid(settings))
    throw Error('Chọn ngày lặp và giới hạn hợp lệ.');
  const effective = futureTaskEffectiveDate(instance, protectedIds, now);
  const updated = {
    ...root,
    repeat: {
      rules: [
        ...root.repeat.rules,
        rule(settings, taskTemplate(draft), effective),
      ],
    },
  };
  let next = tasks.map((t) =>
    t.id === root.id
      ? updated
      : t.id === instance.id &&
          (instance.repeatDate ?? '') >= effective &&
          !instance.completed &&
          !protectedIds.has(instance.id)
        ? {
            ...draft,
            id: instance.id,
            repeatSeriesId: root.id,
            repeatDate: instance.repeatDate,
            repeatOverride: taskRepeatsOn(
              updated.repeat,
              instance.repeatDate ?? effective,
            ),
          }
        : t,
  );
  // Update only already-materialized dates; never fill a gap of years while editing.
  const dates = [
    ...new Set(
      next
        .filter(
          (t) =>
            t.repeatSeriesId === root.id &&
            t.repeatDate &&
            t.repeatDate >= effective,
        )
        .map((t) => t.repeatDate!),
    ),
  ];
  for (const date of dates) {
    const from = new Date(`${date}T00:00:00`);
    next = generateTaskRange(next, from, addDays(from, 1), protectedIds, now);
  }
  return next;
}
