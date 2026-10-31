import { addDays, dayStart, weekStart, type TimeBlock } from './planner';
import { habitOccurrence, localDate, validDate, type Habit } from './habits';
import type { Task } from './tasks';
export type TaskPeriod = 'day' | 'week' | 'month';
export type TaskStatusFilter = 'all' | 'pending' | 'done';
export function taskRange(date: string, period: TaskPeriod) {
  const selected = validDate(date) ? new Date(`${date}T12:00:00`) : new Date();
  const from =
    period === 'week'
      ? weekStart(selected, 1)
      : period === 'month'
        ? new Date(selected.getFullYear(), selected.getMonth(), 1)
        : dayStart(selected);
  const to =
    period === 'month'
      ? new Date(from.getFullYear(), from.getMonth() + 1, 1)
      : addDays(from, period === 'week' ? 7 : 1);
  return { from, to };
}
export function shiftTaskDate(
  date: string,
  period: TaskPeriod,
  direction: number,
) {
  const selected = new Date(`${date}T12:00:00`);
  return localDate(
    period === 'month'
      ? new Date(selected.getFullYear(), selected.getMonth() + direction, 1)
      : addDays(selected, direction * (period === 'week' ? 7 : 1)),
  );
}
export type TaskRow = {
  task: Task;
  blocks: TimeBlock[];
  allBlocks: TimeBlock[];
  fallback?: number;
  fallbackDateOnly: boolean;
  inRange: boolean;
  overdue: boolean;
  unscheduled: boolean;
};
export function projectTaskPeriod(
  tasks: Task[],
  activeBlocks: TimeBlock[],
  storedBlocks: TimeBlock[],
  habits: Habit[],
  from: Date,
  to: Date,
  now = new Date(),
): TaskRow[] {
  const active = new Map<string, TimeBlock[]>(),
    stored = new Map<string, TimeBlock[]>();
  const index = (map: Map<string, TimeBlock[]>, b: TimeBlock) => {
    const entries = map.get(b.taskId);
    if (entries) entries.push(b);
    else map.set(b.taskId, [b]);
  };
  for (const b of activeBlocks) if (!b.cancelled) index(active, b);
  for (const b of storedBlocks) index(stored, b);
  const byHabit = new Map(habits.map((h) => [h.id, h]));
  const today = +dayStart(now),
    rows: TaskRow[] = [];
  for (const task of tasks) {
    if (task.repeat || task.deletedAt !== undefined) continue;
    const h = task.habitId ? byHabit.get(task.habitId) : undefined;
    const blocks = (active.get(task.id) ?? []).sort(
      (a, b) => a.start - b.start,
    );
    // Deletion markers and cancelled/paused instances must not become an "unscheduled" backlog.
    if (h?.deletedAt !== undefined && !task.completed) continue;
    if (task.habitId && !task.completed && !blocks.length) {
      if (stored.get(task.id)?.length) continue;
      if (
        h &&
        task.habitDate &&
        task.habitDate >= localDate(now) &&
        (h.archived || (h.recurrence && !habitOccurrence(h, task.habitDate)))
      )
        continue;
    }
    let fallback: number | undefined,
      fallbackDateOnly = false;
    if (!blocks.length) {
      const planned = task.repeatDate ?? task.plannedStart?.trim();
      if (planned && validDate(planned)) {
        // Date-only legacy values represent a local day, never UTC midnight.
        fallback = +new Date(`${planned}T00:00:00`);
        fallbackDateOnly = true;
      } else if (planned && Number.isFinite(+new Date(planned)))
        fallback = +new Date(planned);
      else if (task.habitDate && validDate(task.habitDate)) {
        fallback = +new Date(`${task.habitDate}T00:00:00`);
        fallbackDateOnly = true;
      }
    }
    const matching = blocks.filter((b) => b.start < +to && b.end > +from);
    const inRange =
      matching.length > 0 ||
      (!blocks.length &&
        fallback !== undefined &&
        fallback >= +from &&
        fallback < +to);
    const overdue =
      !task.completed &&
      (blocks.length
        ? blocks.every((b) => b.end <= today)
        : fallback !== undefined && +dayStart(new Date(fallback)) < today);
    rows.push({
      task,
      blocks: matching,
      allBlocks: blocks,
      fallback,
      fallbackDateOnly,
      inRange,
      overdue,
      unscheduled: !blocks.length && fallback === undefined,
    });
  }
  return rows;
}
export const matchesTaskStatus = (row: TaskRow, status: TaskStatusFilter) =>
  status === 'all' || (status === 'done') === row.task.completed;
