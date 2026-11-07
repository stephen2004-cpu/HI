import { advance, record } from './engine';
import { initial, save, type Saved } from './storage';
import { readTaskStore, writeTaskStore, TASK_KEY, type Task } from './tasks';
import * as storage from './workspaceStorage';

/** Explicit free Focus survives reload; older saves retain their previous selection. */
export function focusSelection(data: Saved) {
  if (data.snapshot.run)
    return {
      taskId: data.snapshot.run.taskId ?? '',
      blockId: data.snapshot.run.blockId ?? '',
    };
  if (data.settings.focusSelection)
    return {
      taskId: data.settings.focusSelection.taskId,
      blockId: data.settings.focusSelection.blockId ?? '',
    };
  const previous = data.snapshot.history.find((h) => h.taskId);
  return { taskId: previous?.taskId ?? '', blockId: previous?.blockId ?? '' };
}

/** Use existing measured records, including Study transitions, without completing a Task. */
export function freeFocus(data: Saved, now: number): Saved {
  const snapshot = advance(data.snapshot, now).snapshot;
  return {
    ...data,
    settings: {
      ...data.settings,
      hours: initial.settings.hours,
      minutes: initial.settings.minutes,
      seconds: initial.settings.seconds,
      name: initial.settings.name,
      sessions: structuredClone(initial.settings.sessions),
      loop: false,
      focusSelection: { taskId: '' },
    },
    snapshot: {
      run: null,
      history: snapshot.run
        ? [record(snapshot.run, now, 'stopped'), ...snapshot.history].slice(
            0,
            1000,
          )
        : snapshot.history,
    },
  };
}

export function unfinishedFocusTasks(tasks: Task[], activeId: string) {
  return tasks.filter(
    (t) =>
      t.id !== activeId &&
      !t.completed &&
      t.status === 'doing' &&
      t.deletedAt === undefined &&
      !t.repeat,
  );
}

/** Synchronous paired write. Sync observes the final Task/timer pair, as for Task/Calendar saves. */
export function persistFreeFocus(next: Saved, taskId: string): boolean {
  const loaded = readTaskStore();
  if (loaded.error) return false;
  const task = loaded.tasks.find((t) => t.id === taskId);
  const markUnfinished =
    task &&
    !task.completed &&
    task.deletedAt === undefined &&
    task.status !== 'doing';
  let before: string | null;
  try {
    before = storage.getItem(TASK_KEY);
  } catch {
    return false;
  }
  if (
    markUnfinished &&
    !writeTaskStore(
      loaded.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'doing' } : t,
      ),
    )
  )
    return false;
  if (save(next)) return true;
  if (markUnfinished && before !== null) {
    try {
      storage.setItem(TASK_KEY, before);
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('lbd-tasks-updated'));
    } catch {
      // Keep the current Timer running in the UI and report failure; never claim a successful exit.
    }
  }
  return false;
}
