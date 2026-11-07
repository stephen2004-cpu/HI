import { afterEach, expect, it, vi } from 'vitest';
import { moveTask, readTasks, writeTasks, TASK_KEY, type Task } from './tasks';
afterEach(() => vi.unstubAllGlobals());
const task: Task = {
  id: '1',
  title: 'Viết bài',
  notes: '',
  group: 'do',
  color: '#abcdef',
  completed: false,
};
it('moves priority independently of custom color and completion', () => {
  const moved = moveTask([task], '1', 'schedule');
  expect(moved[0]).toEqual({ ...task, group: 'schedule' });
  expect(task.group).toBe('do');
});
it('round trips tasks, completion and removal', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  expect(readTasks()).toEqual({ tasks: [], error: false });
  expect(writeTasks([{ ...task, completed: true }])).toBe(true);
  expect(readTasks().tasks).toEqual([{ ...task, completed: true }]);
  writeTasks([]);
  expect(readTasks().tasks).toEqual([]);
  expect([...data.keys()]).toEqual([TASK_KEY]);
});
it('detects corrupt data without overwriting it and reports quota failures', () => {
  const set = vi.fn(() => {
    throw Error('quota');
  });
  vi.stubGlobal('localStorage', { getItem: () => '{bad', setItem: set });
  expect(readTasks().error).toBe(true);
  expect(set).not.toHaveBeenCalled();
  expect(writeTasks([task])).toBe(false);
});

it('hides all occurrences of a deleted Habit while visible Task edits retain its raw history and unrelated data', async () => {
  const { saveHabits, deleteHabit, HABIT_KEY } = await import('./habits');
  const { readTaskStore } = await import('./tasks');
  const data = new Map<string, string>([
    ['lbd-focus-v1', 'keep timer history'],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  const habit = {
    id: 'gym',
    name: 'GYM',
    category: 'Cá nhân',
    days: [1, 3, 5],
    weeklyTarget: 3,
    minutes: 25,
    archived: false,
    logs: { '2026-10-26': 'done' as const },
  };
  const pending = {
    ...task,
    id: 'habit-pending',
    title: 'GYM',
    habitId: habit.id,
  };
  const completed = { ...pending, id: 'habit-done', completed: true };
  expect(saveHabits([habit])).toBe(true);
  expect(writeTasks([task, pending, completed])).toBe(true);
  expect(readTasks().tasks).toHaveLength(3);
  expect(saveHabits([deleteHabit(habit)])).toBe(true);
  expect(readTasks().tasks).toEqual([task]);
  expect(writeTasks([{ ...task, notes: 'Changed independent Task' }])).toBe(
    true,
  );
  expect(readTaskStore().tasks).toEqual([
    { ...task, notes: 'Changed independent Task' },
    pending,
    completed,
  ]);
  expect(JSON.parse(data.get(HABIT_KEY)!).habits[0].logs).toEqual(habit.logs);
  expect(data.get('lbd-focus-v1')).toBe('keep timer history');
});
