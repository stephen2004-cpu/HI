export type Mode = 'timer' | 'study';
export type Sound = 'bell' | 'soft' | 'digital' | 'silent';
export type Session = {
  id: string;
  name: string;
  kind: 'study' | 'break';
  seconds: number;
  sound: Sound;
};
export type RecordEntry = {
  blockId?: string;
  focusRunId?: string;
  plannedFocusSeconds?: number;
  plannedBreakSeconds?: number;
  plannedCalendarSeconds?: number;
  breakSeconds?: number;

  taskId?: string;
  actualSeconds?: number;
  id: string;
  name: string;
  type: string;
  seconds: number;
  start: number;
  end: number;
  status: 'completed' | 'stopped';
};
export type Run = {
  blockId?: string;
  focusRunId?: string;
  plannedFocusSeconds?: number;
  plannedBreakSeconds?: number;
  plannedCalendarSeconds?: number;
  breakSeconds?: number;

  taskId?: string;
  measured?: boolean;
  mode: Mode;
  sessions: Session[];
  index: number;
  remaining: number;
  deadline: number;
  started: number;
  status: 'running' | 'paused';
  loop: boolean;
};
export type Snapshot = { run: Run | null; history: RecordEntry[] };
export const uid = () => crypto.randomUUID();
export const defaults: Session[] = [
  {
    id: 'one',
    name: 'Tập trung lần 1',
    kind: 'study',
    seconds: 1800,
    sound: 'bell',
  },
  { id: 'two', name: 'Nghỉ ngơi', kind: 'break', seconds: 300, sound: 'soft' },
  {
    id: 'three',
    name: 'Tập trung lần 2',
    kind: 'study',
    seconds: 1800,
    sound: 'bell',
  },
];
export const current = (r: Run) => r.sessions[r.index];
export function record(
  r: Run,
  end: number,
  status: RecordEntry['status'],
): RecordEntry {
  const s = current(r);
  return {
    id: uid(),
    taskId: r.taskId,
    blockId: r.blockId,
    focusRunId: r.focusRunId,
    plannedFocusSeconds: r.plannedFocusSeconds,
    plannedBreakSeconds: r.plannedBreakSeconds,
    plannedCalendarSeconds: r.plannedCalendarSeconds,
    breakSeconds: r.measured
      ? s.kind === 'break'
        ? Math.max(0, Math.min(s.seconds, s.seconds - remaining(r, end) / 1000))
        : 0
      : undefined,
    actualSeconds: r.measured
      ? s.kind === 'break'
        ? 0
        : Math.max(0, Math.min(s.seconds, s.seconds - remaining(r, end) / 1000))
      : undefined,
    name: s.name,
    type:
      r.mode === 'timer'
        ? 'Đếm ngược'
        : s.kind === 'study'
          ? 'Học tập'
          : 'Nghỉ ngơi',
    seconds: s.seconds,
    start: r.started,
    end,
    status,
  };
}
export function begin(
  mode: Mode,
  sessions: Session[],
  loop: boolean,
  now: number,
): Run {
  return {
    mode,
    measured: true,
    focusRunId: uid(),
    sessions: structuredClone(sessions),
    index: 0,
    remaining: sessions[0].seconds * 1000,
    deadline: now + sessions[0].seconds * 1000,
    started: now,
    status: 'running',
    loop,
  };
}
// Absolute deadlines preserve elapsed time across throttled tabs and reloads.
// Old expired cycles beyond the 1,000-entry history window are skipped to bound recovery work.
export function advance(
  snapshot: Snapshot,
  now: number,
): { snapshot: Snapshot; completed: Session[]; omitted: number } {
  let r = snapshot.run ? structuredClone(snapshot.run) : null;
  const history = [...snapshot.history];
  const completed: Session[] = [];
  let omitted = 0;
  if (!r || r.status === 'paused') return { snapshot, completed, omitted };
  if (r.loop && r.mode === 'study') {
    const cycle = r.sessions.reduce((a, s) => a + s.seconds * 1000, 0);
    const cycles = Math.max(
      0,
      Math.floor((now - r.deadline) / cycle) -
        Math.ceil(1000 / r.sessions.length),
    );
    if (cycles > 0) {
      r.deadline += cycles * cycle;
      r.started += cycles * cycle;
      omitted = cycles * r.sessions.length;
    }
  }
  while (r && now >= r.deadline) {
    const end = r.deadline;
    history.unshift(record(r, end, 'completed'));
    completed.push(current(r));
    if (r.mode === 'timer' || (r.index === r.sessions.length - 1 && !r.loop)) {
      r = null;
      break;
    }
    r.index = (r.index + 1) % r.sessions.length;
    r.started = end;
    r.remaining = current(r).seconds * 1000;
    r.deadline = end + r.remaining;
  }
  if (r) r.remaining = Math.max(0, r.deadline - now);
  return {
    snapshot: { run: r, history: history.slice(0, 1000) },
    completed,
    omitted,
  };
}
export const remaining = (r: Run, now: number) =>
  r.status === 'paused' ? r.remaining : Math.max(0, r.deadline - now);
export const formatClock = (seconds: number) => {
  const n = Math.max(0, Math.ceil(seconds));
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60].map((v) =>
    String(v).padStart(2, '0'),
  );
};
export const duration = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return (
    [h ? `${h} giờ` : '', m ? `${m} phút` : '', sec ? `${sec} giây` : '']
      .filter(Boolean)
      .join(' ') || '0 giây'
  );
};
