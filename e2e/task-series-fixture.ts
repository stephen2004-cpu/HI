import { emptyWorkspace } from '../src/workspace';
import { createTaskRepeat } from '../src/taskRecurrence';
import { scheduleTaskRepeats } from '../src/taskScheduling';
import type { Task } from '../src/tasks';
export function seriesFixture() {
  const source: Task = {
    id: 'breakfast',
    title: 'Ăn sáng',
    notes: 'Bò né',
    group: 'eliminate',
    color: '#ff77aa',
    completed: false,
    timing: { mode: 'timer', focusMinutes: 30, focusCount: 1, breakMinutes: 0 },
    plannedStart: '2026-11-14T07:30',
    plannedEndTime: '08:00',
    repeatSchedule: { time: '07:30', minutes: 30 },
    checklist: [{ id: 'step', text: 'Chuẩn bị', done: false }],
  };
  const { root, instance } = createTaskRepeat(source, {
    mode: 'weekly',
    startDate: '2026-11-14',
    days: [0, 1, 2, 3, 4, 5, 6],
    ending: { type: 'count', count: 5 },
  });
  const workspace = emptyWorkspace();
  const scheduled = scheduleTaskRepeats(
    [
      root,
      instance,
      {
        id: 'independent',
        title: 'Task độc lập',
        notes: 'Giữ nguyên',
        color: '',
        group: 'do',
        completed: false,
      },
    ],
    workspace.planner,
    new Date(2026, 10, 14),
    new Date(2026, 10, 21),
    new Set(),
    new Date(2026, 10, 14, 6),
  );
  workspace.tasks.tasks = scheduled.tasks;
  workspace.planner = scheduled.planner;
  const other = workspace.tasks.tasks.find(
    (t) => t.repeatDate === '2026-11-15',
  )!;
  Object.assign(other, {
    completed: true,
    status: 'done',
    notes: 'Ghi chú riêng',
    checklist: [{ id: 'step', text: 'Chuẩn bị', done: true }],
  });
  workspace.timer.snapshot.history.push({
    id: 'focus-keep',
    taskId: other.id,
    name: 'Ăn sáng',
    type: 'study',
    seconds: 1800,
    actualSeconds: 600,
    start: +new Date(2026, 10, 13, 7),
    end: +new Date(2026, 10, 13, 7, 10),
    status: 'stopped',
  });
  return { workspace, root, instance };
}
