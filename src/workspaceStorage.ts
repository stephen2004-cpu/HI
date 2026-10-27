export const documentKeys = [
  'lbd-focus-v2-timer',
  'lbd-focus-v2-tasks',
  'lbd-focus-v2-planner',
  'lbd-focus-v2-habits',
  'lbd-focus-v2-reviews',
] as const;
let userId: string | null = null;
export function setWorkspaceUser(id: string | null) {
  userId = id;
}
export function workspaceUser() {
  return userId;
}
export function scopedKey(key: string, id = userId) {
  return id ? `lbd-account:${id}:${key}` : key;
}
export function getItem(key: string) {
  if (userId && key === 'lbd-focus-v1') return null;
  return localStorage.getItem(scopedKey(key));
}
export type SyncMeta = { revision: number; dirty: boolean };
export function readMeta(id: string): SyncMeta {
  try {
    return JSON.parse(
      localStorage.getItem(`lbd-account:${id}:sync`) ??
        '{"revision":0,"dirty":false}',
    );
  } catch {
    return { revision: 0, dirty: true };
  }
}
export function writeMeta(id: string, meta: SyncMeta) {
  localStorage.setItem(`lbd-account:${id}:sync`, JSON.stringify(meta));
}
export function setItem(key: string, value: string) {
  const id = userId,
    k = scopedKey(key);
  if (localStorage.getItem(k) === value) return;
  // Mark pending before the write: a failed/quota write must never be reported as synced.
  if (id) writeMeta(id, { ...readMeta(id), dirty: true });
  localStorage.setItem(k, value);
  if (id && typeof window !== 'undefined')
    window.dispatchEvent(new Event('lbd-workspace-changed'));
}
export function downloadBackup(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
