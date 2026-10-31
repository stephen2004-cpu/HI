import type { Habit } from './habits';
export type HabitSyncPhase =
  'loading' | 'synced' | 'pending' | 'error' | 'conflict' | 'remote-waiting';
const phases = new Map<string, HabitSyncPhase>();
const memory = new Map<
  string,
  Record<string, { at: number; erased: boolean }>
>();
const key = (user: string) => `lbd-account:${user}:habit-deletion-ack`;
const announce = () => {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event('lbd-habit-deletion-status'));
};
export function noteHabitSyncPhase(user: string, phase: HabitSyncPhase) {
  phases.set(user, phase);
  announce();
}
/** Called only with a validated server READ, never with a local commit response/revision. */
export function acknowledgeHabitDeletions(user: string, habits: Habit[]) {
  const confirmed = Object.fromEntries(
    habits
      .filter((h) => h.deletedAt !== undefined)
      .map((h) => [
        h.id,
        { at: h.deletedAt!, erased: h.deletedHistory === true },
      ]),
  );
  memory.set(user, confirmed);
  try {
    if (JSON.stringify(confirmed) !== localStorage.getItem(key(user)))
      localStorage.setItem(key(user), JSON.stringify(confirmed));
  } catch {
    /* Confirmation is derived cache; a server read reconstructs it next login. */
  }
  announce();
}
export function deletionStatus(h: Habit, user: string | null) {
  if (!user)
    return {
      phase: 'local',
      text: 'Đã ghi nhận xóa trên thiết bị. Chế độ khách không đồng bộ máy chủ.',
    };
  let confirmed = memory.get(user);
  if (!confirmed) {
    try {
      confirmed = JSON.parse(localStorage.getItem(key(user)) ?? '{}');
    } catch {
      confirmed = {};
    }
  }
  const ack = confirmed?.[h.id];
  if (ack?.at === h.deletedAt && ack?.erased === (h.deletedHistory === true))
    return {
      phase: 'confirmed',
      text: 'Đã đồng bộ xóa thành công. Máy chủ đã xác nhận dấu xóa.',
    };
  const phase = phases.get(user);
  if (phase === 'error')
    return {
      phase: 'error',
      text: 'Đã ghi nhận xóa trên thiết bị nhưng đồng bộ thất bại. Dấu xóa vẫn chờ gửi; chưa xác nhận trên máy chủ.',
    };
  if (phase === 'conflict' || phase === 'remote-waiting')
    return {
      phase: 'pending',
      text: 'Đã ghi nhận xóa trên thiết bị. Đang chờ xử lý xung đột đồng bộ; chưa xác nhận trên máy chủ.',
    };
  return {
    phase: 'pending',
    text: 'Đã ghi nhận xóa trên thiết bị. Đang chờ đồng bộ; chưa xác nhận xóa trên máy chủ.',
  };
}
