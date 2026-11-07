import { afterEach, expect, it, vi } from 'vitest';
import { begin, defaults } from './engine';
import { initial, parseSaved, type Saved } from './storage';
import { TASK_KEY, type Task } from './tasks';
import { setWorkspaceUser } from './workspaceStorage';
import {
  focusSelection,
  freeFocus,
  persistFreeFocus,
  unfinishedFocusTasks,
} from './focusWorkspace';
afterEach(() => {
  vi.unstubAllGlobals();
  setWorkspaceUser(null);
});
const task: Task = {
  id: 'project',
  title: 'Đồ án',
  notes: 'Keep notes',
  group: 'do',
  color: '#aabbcc',
  completed: false,
  checklist: [
    {
      id: 's',
      text: 'Keep checklist',
      done: true,
      documents: [{ id: 'd', name: 'Keep link', url: 'https://example.com' }],
    },
  ],
};
function running(mode: 'timer' | 'study' = 'timer'): Saved {
  const data = structuredClone(initial);
  data.snapshot.run = {
    ...begin(mode, defaults, false, 1000),
    taskId: task.id,
    blockId: 'block',
    plannedFocusSeconds: 3600,
  };
  data.settings.volume = 17;
  data.settings.muted = true;
  return data;
}
it('leaving Countdown stores measured time, retains links/audio/history and resets only the free workspace', () => {
  const data = running();
  const before = structuredClone(data);
  const next = freeFocus(data, 31000);
  expect(data).toEqual(before);
  expect(next.snapshot.run).toBeNull();
  expect(next.snapshot.history).toHaveLength(1);
  expect(next.snapshot.history[0]).toMatchObject({
    status: 'stopped',
    taskId: task.id,
    blockId: 'block',
    actualSeconds: 30,
    plannedFocusSeconds: 3600,
  });
  expect(next.settings).toMatchObject({
    name: initial.settings.name,
    minutes: 25,
    volume: 17,
    muted: true,
  });
  expect(focusSelection(next)).toEqual({ taskId: '', blockId: '' });
  expect(parseSaved(next)).toEqual(next);
});
it('paused time is not counted and an expired Study phase reconciles before leaving', () => {
  const paused = running();
  paused.snapshot.run = {
    ...paused.snapshot.run!,
    status: 'paused',
    remaining: 1780000,
  };
  expect(freeFocus(paused, 1000000).snapshot.history[0].actualSeconds).toBe(20);
  const study = running('study');
  const next = freeFocus(study, 1811000);
  expect(next.snapshot.history).toHaveLength(2);
  expect(next.snapshot.history[0]).toMatchObject({
    status: 'stopped',
    type: 'Nghỉ ngơi',
    actualSeconds: 0,
    breakSeconds: 10,
  });
  expect(next.snapshot.history[1]).toMatchObject({
    status: 'completed',
    actualSeconds: 1800,
  });
  expect(new Set(next.snapshot.history.map((h) => h.id)).size).toBe(2);
});
it('explicit free choice survives history/reload while legacy selections and independent runs remain compatible', () => {
  const data = freeFocus(running(), 31000);
  expect(focusSelection(parseSaved(JSON.parse(JSON.stringify(data)))!)).toEqual(
    { taskId: '', blockId: '' },
  );
  delete data.settings.focusSelection;
  expect(focusSelection(data)).toEqual({ taskId: task.id, blockId: 'block' });
  data.snapshot.run = begin('timer', defaults, false, 32000);
  expect(focusSelection(data)).toEqual({ taskId: '', blockId: '' });
  const malformed = {
    ...data,
    settings: { ...data.settings, focusSelection: { taskId: 123 } },
  };
  expect(parseSaved(malformed)?.snapshot).toEqual(data.snapshot);
  expect(parseSaved(malformed)?.settings.focusSelection).toBeUndefined();
});
it('reminders contain only unfinished ongoing Tasks, never the selected or deleted ones', () => {
  expect(
    unfinishedFocusTasks(
      [
        { ...task, status: 'doing' },
        { ...task, id: 'done', completed: true, status: 'doing' },
        { ...task, id: 'deleted', deletedAt: 123, status: 'doing' },
        { ...task, id: 'unstarted', status: 'todo' },
        { ...task, id: 'selected', status: 'doing' },
      ],
      'selected',
    ),
  ).toEqual([{ ...task, status: 'doing' }]);
});
it.each(['tasks', 'timer'])(
  'a failed %s write keeps the original Task and Timer so a safe retry remains possible',
  (failure) => {
    const before = running();
    const values = new Map([
      [TASK_KEY, JSON.stringify({ version: 1, tasks: [task] })],
      ['lbd-focus-v2-timer', JSON.stringify(before)],
      ['lbd-focus-v1', 'old backup'],
    ]);
    const original = new Map(values);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === (failure === 'tasks' ? TASK_KEY : 'lbd-focus-v2-timer'))
          throw Error('Quota exceeded');
        values.set(key, value);
      },
    });
    expect(persistFreeFocus(freeFocus(before, 31000), task.id)).toBe(false);
    expect(values).toEqual(original);
  },
);
it('persists reminders and stopped records in the account workspace without touching guest/Calendar/Habit documents', () => {
  setWorkspaceUser('owner');
  const values = new Map([
    [
      `lbd-account:owner:${TASK_KEY}`,
      JSON.stringify({
        version: 1,
        tasks: [task, { ...task, id: 'done', completed: true }],
      }),
    ],
    [TASK_KEY, 'guest Task backup'],
    ['lbd-focus-v1', 'legacy timer'],
    ['lbd-account:owner:lbd-focus-v2-planner', 'Calendar unchanged'],
    ['lbd-account:owner:lbd-focus-v2-habits', 'Habit unchanged'],
  ]);
  const original = new Map(values);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  expect(persistFreeFocus(freeFocus(running(), 31000), task.id)).toBe(true);
  const stored = JSON.parse(values.get(`lbd-account:owner:${TASK_KEY}`)!).tasks;
  expect(stored[0]).toEqual({ ...task, status: 'doing' });
  expect(stored[1].completed).toBe(true);
  expect(
    JSON.parse(values.get('lbd-account:owner:lbd-focus-v2-timer')!).snapshot
      .history[0].actualSeconds,
  ).toBe(30);
  for (const [key, value] of original)
    if (key !== `lbd-account:owner:${TASK_KEY}`)
      expect(values.get(key)).toBe(value);
});
