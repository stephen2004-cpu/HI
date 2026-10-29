import { initial, parseSaved, type Saved } from './storage';
import { validTask, type Task } from './tasks';
import { defaultPlanner, validBlock, type Planner } from './planner';
import { validHabit, mergeHabitDeletions, type Habit } from './habits';
import { validReview, type Review } from './performance';
import { documentKeys, scopedKey } from './workspaceStorage';
export type Workspace = {
  timer: Saved;
  tasks: { version: 1; tasks: Task[] };
  planner: Planner;
  habits: { version: 1; habits: Habit[] };
  reviews: Review[];
};
export const emptyWorkspace = (): Workspace => ({
  timer: structuredClone(initial),
  tasks: { version: 1, tasks: [] },
  planner: structuredClone(defaultPlanner),
  habits: { version: 1, habits: [] },
  reviews: [],
});
const unique = (a: { id: string }[]) =>
  new Set(a.map((x) => x.id)).size === a.length;
export function validWorkspace(x: unknown): x is Workspace {
  try {
    const w = x as Workspace;
    return (
      !!w &&
      !!parseSaved(w.timer) &&
      w.tasks.version === 1 &&
      Array.isArray(w.tasks.tasks) &&
      w.tasks.tasks.every(validTask) &&
      unique(w.tasks.tasks) &&
      w.planner.version === 1 &&
      Array.isArray(w.planner.blocks) &&
      w.planner.blocks.every(validBlock) &&
      unique(w.planner.blocks) &&
      [0, 1].includes(w.planner.preferences.weekStart) &&
      Number.isInteger(w.planner.preferences.blockMinutes) &&
      w.planner.preferences.blockMinutes >= 15 &&
      w.planner.preferences.blockMinutes <= 1440 &&
      w.habits.version === 1 &&
      Array.isArray(w.habits.habits) &&
      w.habits.habits.every(validHabit) &&
      unique(w.habits.habits) &&
      Array.isArray(w.reviews) &&
      w.reviews.every(validReview) &&
      new Set(w.reviews.map((r) => r.runId)).size === w.reviews.length
    );
  } catch {
    return false;
  }
}
const fields = ['timer', 'tasks', 'planner', 'habits', 'reviews'] as const;
export function readWorkspace(id: string | null): Workspace {
  const result = emptyWorkspace();
  documentKeys.forEach((key, i) => {
    const raw =
      localStorage.getItem(scopedKey(key, id)) ??
      (!id && i === 0 ? localStorage.getItem('lbd-focus-v1') : null);
    if (raw !== null)
      (result as unknown as Record<string, unknown>)[fields[i]] =
        JSON.parse(raw);
  });
  if (!validWorkspace(result))
    throw Error(
      'Dữ liệu trên thiết bị không hợp lệ. Đã giữ nguyên, chưa đồng bộ.',
    );
  return result;
}
export function storeWorkspace(id: string, w: Workspace) {
  if (!validWorkspace(w))
    throw Error('Dữ liệu máy chủ không hợp lệ. Chưa áp dụng vào thiết bị.');
  // One recoverable snapshot precedes multi-key application; never touch guest/legacy keys.
  localStorage.setItem(`lbd-account:${id}:incoming`, JSON.stringify(w));
  documentKeys.forEach((key, i) =>
    localStorage.setItem(scopedKey(key, id), JSON.stringify(w[fields[i]])),
  );
  localStorage.removeItem(`lbd-account:${id}:incoming`);
}
export function recoverIncoming(id: string) {
  const raw = localStorage.getItem(`lbd-account:${id}:incoming`);
  if (raw) storeWorkspace(id, JSON.parse(raw));
}
export function backupAccount(id: string, w: Workspace) {
  const key = `lbd-account:${id}:backup:${Date.now()}:${crypto.randomUUID()}`;
  localStorage.setItem(key, JSON.stringify(w));
  return key;
}
export function mergeGuest(account: Workspace, guest: Workspace): Workspace {
  const merge = <T>(a: T[], b: T[], key: (x: T) => string) => [
    ...new Map([...b, ...a].map((x) => [key(x), x])).values(),
  ];
  const empty =
    account.tasks.tasks.length === 0 &&
    account.timer.snapshot.history.length === 0 &&
    account.habits.habits.length === 0 &&
    account.planner.blocks.length === 0 &&
    account.reviews.length === 0 &&
    !account.timer.snapshot.run &&
    Object.entries(initial.settings).every(
      ([k, v]) =>
        JSON.stringify(
          account.timer.settings[k as keyof typeof initial.settings],
        ) === JSON.stringify(v),
    );
  return {
    timer: {
      ...account.timer,
      settings: empty ? guest.timer.settings : account.timer.settings,
      snapshot: {
        run: account.timer.snapshot.run,
        history: merge(
          account.timer.snapshot.history,
          guest.timer.snapshot.history,
          (h) => h.id,
        )
          .sort((a, b) => b.end - a.end)
          .slice(0, 1000),
      },
    },
    tasks: {
      version: 1,
      tasks: merge(account.tasks.tasks, guest.tasks.tasks, (t) => t.id),
    },
    planner: {
      ...account.planner,
      blocks: merge(account.planner.blocks, guest.planner.blocks, (b) => b.id),
    },
    habits: {
      version: 1,
      habits: mergeHabitDeletions(
        merge(account.habits.habits, guest.habits.habits, (h) => h.id),
        mergeHabitDeletions(guest.habits.habits, account.habits.habits),
      ),
    },
    reviews: merge(account.reviews, guest.reviews, (r) => r.runId),
  };
}

export function workspaceFingerprint(w: Workspace): string {
  const copy = structuredClone(w);
  copy.tasks.tasks.sort((a, b) => a.id.localeCompare(b.id));
  copy.planner.blocks.sort((a, b) => a.id.localeCompare(b.id));
  copy.habits.habits.sort((a, b) => a.id.localeCompare(b.id));
  copy.timer.snapshot.history.sort((a, b) => a.id.localeCompare(b.id));
  copy.reviews.sort((a, b) => a.runId.localeCompare(b.runId));
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return JSON.stringify(canonical(copy));
}

export function parseBackup(text: string): Workspace {
  const file = JSON.parse(text);
  if (file?.version !== 1) throw Error('Unsupported backup');
  if (validWorkspace(file.data)) return file.data;
  if (!file.data || typeof file.data !== 'object' || Array.isArray(file.data))
    throw Error('Invalid backup');
  const w = emptyWorkspace();
  let present = false;
  documentKeys.forEach((key, i) => {
    const raw = file.data[key] ?? (i === 0 ? file.data['lbd-focus-v1'] : null);
    if (raw !== undefined && raw !== null) {
      if (typeof raw !== 'string') throw Error('Invalid backup document');
      (w as unknown as Record<string, unknown>)[fields[i]] = JSON.parse(raw);
      present = true;
    }
  });
  if (!present || !validWorkspace(w)) throw Error('Invalid backup');
  return w;
}
