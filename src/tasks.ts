import * as workspaceStorage from './workspaceStorage';
import { validStepDocument, type ChecklistStep } from './checklist';
export type { ChecklistStep } from './checklist';
export const groups = [
  {
    id: 'do',
    name: 'Làm ngay',
    color: '#4ADE80',
    description: 'Quan trọng · Khẩn cấp',
  },
  {
    id: 'schedule',
    name: 'Lên lịch',
    color: '#FBBF24',
    description: 'Quan trọng · Không khẩn cấp',
  },
  {
    id: 'delegate',
    name: 'Ủy quyền',
    color: '#60A5FA',
    description: 'Không quan trọng · Khẩn cấp',
  },
  {
    id: 'eliminate',
    name: 'Loại bỏ',
    color: '#F472B6',
    description: 'Không quan trọng · Không khẩn cấp',
  },
] as const;
export type Group = (typeof groups)[number]['id'];
export type Task = {
  habitId?: string;
  habitDate?: string;
  checklist?: ChecklistStep[];
  expectedOutput?: string;
  actualOutput?: string;
  timing?: TaskTiming;
  plannedStart?: string;
  status?: 'todo' | 'doing' | 'done';
  id: string;
  title: string;
  notes: string;
  group: Group;
  color: string;
  completed: boolean;
};
export const TASK_KEY = 'lbd-focus-v2-tasks';
export function validTask(t: unknown): t is Task {
  if (!t || typeof t !== 'object') return false;
  const x = t as Task;
  return (
    typeof x.id === 'string' &&
    !!x.id &&
    typeof x.title === 'string' &&
    !!x.title.trim() &&
    typeof x.notes === 'string' &&
    groups.some((g) => g.id === x.group) &&
    (x.color === '' || /^#[0-9a-f]{6}$/i.test(x.color)) &&
    typeof x.completed === 'boolean' &&
    (x.expectedOutput === undefined || typeof x.expectedOutput === 'string') &&
    (x.actualOutput === undefined || typeof x.actualOutput === 'string') &&
    (x.plannedStart === undefined || typeof x.plannedStart === 'string') &&
    (x.status === undefined || ['todo', 'doing', 'done'].includes(x.status)) &&
    (x.checklist === undefined ||
      (Array.isArray(x.checklist) &&
        x.checklist.every(
          (s) =>
            s &&
            typeof s.id === 'string' &&
            typeof s.text === 'string' &&
            typeof s.done === 'boolean' &&
            (s.documents === undefined ||
              (Array.isArray(s.documents) &&
                s.documents.every(validStepDocument) &&
                new Set(s.documents.map((d) => d.id)).size ===
                  s.documents.length)),
        ))) &&
    (x.timing === undefined ||
      (x.timing &&
        ['timer', 'study'].includes(x.timing.mode) &&
        Number.isFinite(x.timing.focusMinutes) &&
        x.timing.focusMinutes >= 1 / 60 &&
        x.timing.focusMinutes <= 1440 &&
        Number.isInteger(x.timing.focusCount) &&
        x.timing.focusCount >= 1 &&
        x.timing.focusCount <= 25 &&
        Number.isFinite(x.timing.breakMinutes) &&
        x.timing.breakMinutes >= 0 &&
        x.timing.breakMinutes <= 1440))
  );
}
export function readTasks(): { tasks: Task[]; error: boolean } {
  try {
    const raw = workspaceStorage.getItem(TASK_KEY);
    if (raw === null) return { tasks: [], error: false };
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.tasks) ||
      !data.tasks.every(validTask) ||
      new Set(data.tasks.map((t: Task) => t.id)).size !== data.tasks.length
    )
      throw new Error('Invalid tasks');
    return { tasks: data.tasks, error: false };
  } catch {
    return { tasks: [], error: true };
  }
}
export function writeTasks(tasks: Task[]): boolean {
  try {
    workspaceStorage.setItem(TASK_KEY, JSON.stringify({ version: 1, tasks }));
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event('lbd-tasks-updated'));
    return true;
  } catch {
    return false;
  }
}
export function moveTask(tasks: Task[], id: string, group: Group): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, group } : t));
}

export type TaskTiming = {
  mode: 'timer' | 'study';
  focusMinutes: number;
  focusCount: number;
  breakMinutes: number;
};
export const defaultTiming: TaskTiming = {
  mode: 'timer',
  focusMinutes: 25,
  focusCount: 3,
  breakMinutes: 5,
};
export const timingOf = (t?: Task): TaskTiming => ({
  ...defaultTiming,
  ...t?.timing,
});
export function plannedTask(t?: Task) {
  const c = timingOf(t),
    focus = c.focusMinutes * 60 * (c.mode === 'study' ? c.focusCount : 1),
    rest =
      c.mode === 'study'
        ? Math.max(0, c.focusCount - 1) * c.breakMinutes * 60
        : 0;
  return { focus, rest, total: focus + rest };
}
export function taskSessions(t: Task) {
  const c = timingOf(t);
  return Array.from(
    { length: c.mode === 'study' ? c.focusCount : 1 },
    (_, i) => [
      {
        id: crypto.randomUUID(),
        name: `${t.title}${c.mode === 'study' ? ` · Focus ${i + 1}` : ''}`,
        kind: 'study' as const,
        seconds: c.focusMinutes * 60,
        sound: 'bell' as const,
      },
      ...(c.mode === 'study' && i < c.focusCount - 1 && c.breakMinutes > 0
        ? [
            {
              id: crypto.randomUUID(),
              name: 'Nghỉ ngơi',
              kind: 'break' as const,
              seconds: c.breakMinutes * 60,
              sound: 'soft' as const,
            },
          ]
        : []),
    ],
  ).flat();
}
