import { scheduledThrough } from './habitLimits';
import { localDate } from './habits';
import {
  addDays,
  loadPlanner,
  savePlanner,
  PLANNER_KEY,
  type Planner,
  type TimeBlock,
} from './planner';
import {
  generateTaskRange,
  repeatRule,
  taskRepeatsOn,
  visibleTaskInstances,
} from './taskRecurrence';
import {
  plannedTask,
  readTaskStore,
  writeTaskStore,
  TASK_KEY,
  type Task,
} from './tasks';
import * as storage from './workspaceStorage';

const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function scheduleOf(task: Task): Task['repeatSchedule'] {
  if (task.plannedStart) {
    const time = task.plannedStart.slice(11, 16);
    if (!clock.test(time) || !Number.isFinite(+new Date(task.plannedStart)))
      throw Error('Chọn giờ bắt đầu hợp lệ.');
    const minutes = task.plannedEndTime
      ? minute(task.plannedEndTime) - minute(time)
      : plannedTask(task).total / 60;
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)
      throw Error('Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.');
    return { time, minutes };
  }
  return task.repeatSchedule ?? null;
}
export function repeatDraft(task: Task): Task {
  const schedule = task.repeatSchedule;
  if (!schedule || !task.repeatDate || task.plannedStart) return { ...task };
  const end = (minute(schedule.time) + schedule.minutes) % 1440;
  return {
    ...task,
    plannedStart: `${task.repeatDate}T${schedule.time}`,
    // Do not invent an invalid same-day end for an existing overnight duration.
    plannedEndTime:
      end > minute(schedule.time)
        ? `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(Math.floor(end % 60)).padStart(2, '0')}`
        : undefined,
  };
}
function legacySchedule(tasks: Task[], rootId: string) {
  // The original occurrence is the only legacy source of a series time. Never infer
  // times from a Calendar block or an individually dragged/resized occurrence.
  const source = tasks.find(
    (t) =>
      t.repeatSeriesId === rootId &&
      !t.id.startsWith('task-repeat:') &&
      t.plannedStart,
  );
  if (!source) return undefined;
  try {
    return scheduleOf(source);
  } catch {
    return undefined;
  }
}
export function visibleTaskBlocks(
  blocks: TimeBlock[],
  tasks: Task[],
  protectedIds = new Set<string>(),
  now = new Date(),
) {
  const visible = new Set(
    visibleTaskInstances(tasks, now, protectedIds).map((t) => t.id),
  );
  return blocks.filter((b) => {
    if (b.cancelled) return false;
    const task = tasks.find((t) => t.id === b.taskId);
    if (task?.deletedAt !== undefined) return false;
    return !b.recurringTaskId || !task || visible.has(task.id);
  });
}
/** Pure, deterministic reconciliation. No network, no Timer writes, no implicit times. */
export function scheduleTaskRepeats(
  tasks: Task[],
  planner: Planner,
  from: Date,
  to: Date,
  protectedIds = new Set<string>(),
  now = new Date(),
) {
  let next = generateTaskRange(tasks, from, to, protectedIds, now);
  const roots = tasks.filter((t) => t.repeat && t.deletedAt === undefined);
  for (const root of roots) {
    const rules = [...root.repeat!.rules].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate),
    );
    const last = rules.at(-1)!;
    if (
      !last.enabled ||
      !last.ending ||
      (!rules.some((r) => r.template.repeatSchedule) &&
        !legacySchedule(tasks, root.id))
    )
      continue;
    if (last.ending.type === 'count' && last.ending.count > 10000)
      throw Error(
        'Tối đa 10.000 lần cho một chuỗi hữu hạn; hãy giảm số lần hoặc dùng không giới hạn.',
      );
    const start = new Date(`${rules[0].startDate}T00:00:00`);
    const end =
      last.ending.type === 'date'
        ? addDays(new Date(`${last.ending.date}T00:00:00`), 1)
        : addDays(
            new Date(
              `${last.startDate > last.effectiveDate ? last.startDate : last.effectiveDate}T00:00:00`,
            ),
            last.ending.count * 7 + 7,
          );
    if (+end - +start > 366000 * 86400000 || !Number.isFinite(+end))
      throw Error('Khoảng lịch quá dài. Hãy chọn ngày kết thúc gần hơn.');
    const total = scheduledThrough(
      {
        rules: rules.map((r) => ({
          ...r,
          time: '12:00',
          minutes: 1,
          days: r.enabled ? r.days : [],
        })),
        pauses: [],
      },
      localDate(addDays(end, -1)),
    );
    if (total > 10000)
      throw Error(
        'Tối đa 10.000 lần cho một chuỗi hữu hạn; hãy chọn ngày kết thúc gần hơn.',
      );
    // Bounded chunks, finite chains materialized fully even beyond the current week.
    for (let day = start; +day < +end; day = addDays(day, 61)) {
      const until = new Date(Math.min(+end, +addDays(day, 61)));
      next = generateTaskRange(
        next,
        day,
        until,
        protectedIds,
        now,
        new Set([root.id]),
      );
    }
  }
  const blocks = [...planner.blocks];
  const live = new Set(
    visibleTaskInstances(next, now, protectedIds).map((t) => t.id),
  );
  let added = 0,
    updated = 0,
    cancelled = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i],
      task = next.find((t) => t.id === b.taskId);
    if (!b.recurringTaskId || b.cancelled || !task) continue;
    if (
      task.deletedAt !== undefined ||
      (!live.has(task.id) &&
        b.start >= +now &&
        !task.completed &&
        !protectedIds.has(task.id))
    ) {
      blocks[i] = { ...b, cancelled: true };
      cancelled++;
    }
  }
  for (const task of next) {
    if (
      !task.repeatSeriesId ||
      !task.repeatDate ||
      task.deletedAt !== undefined ||
      !live.has(task.id)
    )
      continue;
    const root = roots.find((t) => t.id === task.repeatSeriesId);
    if (!root?.repeat) continue;
    const rule = repeatRule(root.repeat, task.repeatDate);
    const schedule =
      task.repeatOverride && task.repeatSchedule !== undefined
        ? task.repeatSchedule
        : rule?.template.repeatSchedule !== undefined
          ? rule.template.repeatSchedule
          : legacySchedule(next, root.id);
    if (!schedule) continue;
    // Invalid/exhausted rule dates never get new blocks, even if history is visible.
    if (!taskRepeatsOn(root.repeat, task.repeatDate) && !task.repeatOverride)
      continue;
    const occurrenceDate =
      task.repeatOverride && task.repeatSchedule && task.plannedStart
        ? task.plannedStart.slice(0, 10)
        : task.repeatDate;
    const start = +new Date(`${occurrenceDate}T${schedule.time}:00`),
      end = start + schedule.minutes * 60000;
    if (!Number.isFinite(start) || end <= start) continue;
    const existing = blocks.filter((b) => b.taskId === task.id);
    if (existing.length) {
      // Manual, multiple, cancelled and individually edited blocks are authoritative.
      if (
        existing.length !== 1 ||
        existing[0].id !== `task-block:${task.id}` ||
        !existing[0].recurringTaskId ||
        existing[0].taskOverride ||
        existing[0].cancelled ||
        existing[0].start < +now ||
        task.completed ||
        protectedIds.has(task.id)
      )
        continue;
      const b = existing[0];
      if (b.start !== start || b.end !== end || b.title !== task.title) {
        blocks[blocks.findIndex((x) => x.id === b.id)] = {
          ...b,
          start,
          end,
          title: task.title,
        };
        updated++;
      }
    } else if (!task.completed && !protectedIds.has(task.id)) {
      blocks.push({
        id: `task-block:${task.id}`,
        taskId: task.id,
        title: task.title,
        start,
        end,
        color: '',
        recurringTaskId: root.id,
      });
      added++;
    }
  }
  const active = visibleTaskBlocks(blocks, next, protectedIds, now);
  const conflicts = new Set<string>();
  for (const b of active.filter((b) => b.recurringTaskId && b.start >= +now)) {
    if (
      active.some(
        (other) =>
          other.id !== b.id && other.start < b.end && other.end > b.start,
      )
    )
      conflicts.add(b.id);
  }
  return {
    tasks: next,
    planner: added || updated || cancelled ? { ...planner, blocks } : planner,
    added,
    updated,
    cancelled,
    conflicts: conflicts.size,
  };
}
/** Synchronous paired write with exact rollback; sync observes the final pair. */
export function persistTaskCalendar(tasks: Task[], planner: Planner): boolean {
  const beforeTasks = storage.getItem(TASK_KEY),
    beforePlanner = storage.getItem(PLANNER_KEY);
  if (readTaskStore().error || loadPlanner().error) return false;
  if (!writeTaskStore(tasks)) return false;
  if (!savePlanner(planner)) {
    try {
      if (beforeTasks === null)
        localStorage.removeItem(storage.scopedKey(TASK_KEY));
      else storage.setItem(TASK_KEY, beforeTasks);
      if (beforePlanner === null)
        localStorage.removeItem(storage.scopedKey(PLANNER_KEY));
      else storage.setItem(PLANNER_KEY, beforePlanner);
      window.dispatchEvent(new Event('lbd-tasks-updated'));
    } catch {
      /* Original planner remains intact; report failure, never success. */
    }
    return false;
  }
  window.dispatchEvent(new Event('lbd-planner-updated'));
  return true;
}
