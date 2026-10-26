export const groups = [
  {
    id: 'do',
    name: 'Làm ngay',
    color: '#58b87b',
    description: 'Quan trọng · Khẩn cấp',
  },
  {
    id: 'schedule',
    name: 'Lên lịch',
    color: '#e4c34f',
    description: 'Quan trọng · Không khẩn cấp',
  },
  {
    id: 'delegate',
    name: 'Ủy quyền',
    color: '#64a6e8',
    description: 'Không quan trọng · Khẩn cấp',
  },
  {
    id: 'eliminate',
    name: 'Loại bỏ',
    color: '#e68fb3',
    description: 'Không quan trọng · Không khẩn cấp',
  },
] as const;
export type Group = (typeof groups)[number]['id'];
export type Task = {
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
    typeof x.completed === 'boolean'
  );
}
export function readTasks(): { tasks: Task[]; error: boolean } {
  try {
    const raw = localStorage.getItem(TASK_KEY);
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
    localStorage.setItem(TASK_KEY, JSON.stringify({ version: 1, tasks }));
    return true;
  } catch {
    return false;
  }
}
export function moveTask(tasks: Task[], id: string, group: Group): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, group } : t));
}
