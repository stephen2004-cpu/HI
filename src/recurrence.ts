import { habitOccurrence, localDate, type Habit } from './habits';
import { addDays, dayStart, type Planner, type TimeBlock } from './planner';
import type { Task } from './tasks';
export const habitTaskId = (id: string, date: string) => `habit:${id}:${date}`;
export const habitBlockId = (id: string, date: string) =>
  `habit-block:${id}:${date}`;
export function generateHabitRange(
  habits: Habit[],
  planner: Planner,
  tasks: Task[],
  from: Date,
  to: Date,
  protectedTaskIds: Set<string>,
  now = Date.now(),
) {
  const nextTasks = [...tasks],
    blocks = [...planner.blocks];
  let tasksChanged = false,
    blocksChanged = false;
  // The caller supplies a visible day/week/month; bound corrupt input rather than generating unbounded data.
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    +to <= +from ||
    +to - +from > 62 * 86400000
  )
    return { tasks, planner, tasksChanged, blocksChanged };
  for (let day = dayStart(from); +day < +to; day = addDays(day, 1))
    for (const h of habits) {
      if (h.deletedAt !== undefined) continue;
      const date = localDate(day),
        occurrence = habitOccurrence(h, date);
      if (!occurrence || (h.archived && occurrence.start >= now)) continue;
      const taskId = habitTaskId(h.id, date),
        blockId = habitBlockId(h.id, date);
      const index = blocks.findIndex((b) => b.id === blockId),
        existing = index < 0 ? undefined : blocks[index];
      if (existing?.cancelled) continue;
      const existingTask = nextTasks.find((t) => t.id === taskId);
      // A retained Calendar block whose source Task was explicitly deleted is
      // historical evidence, not permission to recreate that Task on filtering.
      if (existing && !existingTask) continue;
      const protectedInstance =
        protectedTaskIds.has(taskId) ||
        existingTask?.completed ||
        h.logs[date] === 'done' ||
        (!!existing && existing.start < now);
      if (!nextTasks.some((t) => t.id === taskId)) {
        nextTasks.push({
          id: taskId,
          title: h.name,
          notes: `Lần thực hiện thói quen ngày ${date}. Ghi nhận tại trang Thói quen sau khi làm.`,
          group: 'schedule',
          color: '',
          completed: false,
          habitId: h.id,
          habitDate: date,
          timing: {
            mode: 'timer',
            focusMinutes: occurrence.minutes,
            focusCount: 1,
            breakMinutes: 0,
          },
        });
        tasksChanged = true;
      }
      if (!existing) {
        blocks.push({
          id: blockId,
          taskId,
          title: h.name,
          start: occurrence.start,
          end: occurrence.end,
          color: '',
          recurringHabitId: h.id,
          habitDate: date,
        });
        blocksChanged = true;
      } else if (
        existing.recurringHabitId &&
        !existing.habitOverride &&
        !protectedInstance &&
        (existing.start !== occurrence.start || existing.end !== occurrence.end)
      ) {
        blocks[index] = {
          ...existing,
          start: occurrence.start,
          end: occurrence.end,
        };
        blocksChanged = true;
        const ti = nextTasks.findIndex((t) => t.id === taskId);
        if (
          ti >= 0 &&
          nextTasks[ti].timing?.mode === 'timer' &&
          nextTasks[ti].timing?.focusMinutes ===
            (existing.end - existing.start) / 60000
        ) {
          nextTasks[ti] = {
            ...nextTasks[ti],
            timing: {
              mode: 'timer',
              focusMinutes: occurrence.minutes,
              focusCount: 1,
              breakMinutes: 0,
            },
          };
          tasksChanged = true;
        }
      }
    }
  return {
    tasks: tasksChanged ? nextTasks : tasks,
    planner: blocksChanged ? { ...planner, blocks } : planner,
    tasksChanged,
    blocksChanged,
  };
}
export function visibleHabitBlocks(
  blocks: TimeBlock[],
  habits: Habit[],
  protectedTaskIds: Set<string>,
  now = Date.now(),
) {
  return blocks.filter((b) => {
    if (b.cancelled) return false;
    // Older manual connections used the stable automatic ID but omitted metadata.
    const h = habits.find(
      (h) =>
        h.id === b.recurringHabitId ||
        (!!h.recurrence && b.id.startsWith(`habit-block:${h.id}:`)),
    );
    if (!b.recurringHabitId && !h) return true;
    if (h?.deletedAt !== undefined && b.start >= h.deletedAt) return false;
    if (protectedTaskIds.has(b.taskId) || h?.logs[b.habitDate ?? ''] === 'done')
      return true;
    if (!h || !h.recurrence) return b.start < now;
    if (h.archived && b.start >= now) return false;
    if (
      (h.recurrence.endedAt !== undefined && b.start >= h.recurrence.endedAt) ||
      h.recurrence.pauses.some(
        (p) => b.start >= p.from && (p.to === undefined || b.start < p.to),
      )
    )
      return false;
    if (b.start < now) return true;
    return b.habitOverride || !!habitOccurrence(h, b.habitDate ?? '');
  });
}
// Preserve hidden/cancelled history; an explicit edit applies only to this occurrence.
export function applyCalendarEdit(
  stored: Planner,
  visible: TimeBlock[],
  next: Planner,
): Planner {
  const visibleIds = new Set(visible.map((b) => b.id)),
    nextIds = new Set(next.blocks.map((b) => b.id));
  const hidden = stored.blocks.filter((b) => !visibleIds.has(b.id));
  const cancelled = visible
    .filter((b) => b.recurringHabitId && !nextIds.has(b.id))
    .map((b) => ({ ...b, cancelled: true }));
  const edited = next.blocks.map((b) => {
    const old = stored.blocks.find((x) => x.id === b.id);
    return old?.recurringHabitId &&
      (old.start !== b.start ||
        old.end !== b.end ||
        old.color !== b.color ||
        old.taskId !== b.taskId)
      ? { ...b, habitOverride: true }
      : b;
  });
  return { ...next, blocks: [...hidden, ...edited, ...cancelled] };
}
