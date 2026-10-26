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
