import * as workspaceStorage from './workspaceStorage';
import { type Snapshot, type Session, type Sound, defaults } from './engine';
export type Settings = {
  hours: number;
  minutes: number;
  seconds: number;
  name: string;
  sessions: Session[];
  loop: boolean;
  volume: number;
  muted: boolean;
};
export type Saved = { version: 1; snapshot: Snapshot; settings: Settings };
export const initial: Saved = {
  version: 1,
  snapshot: { run: null, history: [] },
  settings: {
    hours: 0,
    minutes: 25,
    seconds: 0,
    name: 'Thời gian tập trung',
    sessions: defaults,
    loop: false,
    volume: 60,
    muted: false,
  },
};
const sounds: Sound[] = ['bell', 'soft', 'digital', 'silent'];
const num = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const session = (s: Session) =>
  s &&
  typeof s.id === 'string' &&
  typeof s.name === 'string' &&
  ['study', 'break'].includes(s.kind) &&
  num(s.seconds, 359999) &&
  s.seconds >= 1 &&
  sounds.includes(s.sound);
export function parseSaved(value: unknown): Saved | null {
  try {
    const x = structuredClone(value) as Saved;
    if (!x || x.version !== 1) return null;
    const s = x.settings;
    if (
      !s ||
      !num(s.hours, 99) ||
      !num(s.minutes, 59) ||
      !num(s.seconds, 59) ||
      typeof s.name !== 'string' ||
      !Array.isArray(s.sessions) ||
      !s.sessions.length ||
      s.sessions.length > 50 ||
      !s.sessions.every(session) ||
      !num(s.volume, 100) ||
      typeof s.loop !== 'boolean' ||
      typeof s.muted !== 'boolean'
    )
      return null;
    const r = x.snapshot?.run;
    if (
      r &&
      (!['timer', 'study'].includes(r.mode) ||
        !Array.isArray(r.sessions) ||
        !r.sessions.length ||
        !r.sessions.every(session) ||
        !Number.isInteger(r.index) ||
        r.index < 0 ||
        r.index >= r.sessions.length ||
        !num(r.remaining, 359999000) ||
        !num(r.deadline, Number.MAX_SAFE_INTEGER) ||
        !num(r.started, Number.MAX_SAFE_INTEGER) ||
        !['running', 'paused'].includes(r.status) ||
        typeof r.loop !== 'boolean')
    )
      return null;
    if (!Array.isArray(x.snapshot?.history)) return null;
    x.snapshot.history = x.snapshot.history
      .filter(
        (h) =>
          h &&
          typeof h.id === 'string' &&
          typeof h.name === 'string' &&
          typeof h.type === 'string' &&
          num(h.seconds, 359999) &&
          num(h.start, Number.MAX_SAFE_INTEGER) &&
          num(h.end, Number.MAX_SAFE_INTEGER) &&
          ['completed', 'stopped'].includes(h.status),
      )
      .slice(0, 1000);
    // Optional V2 metadata must not invalidate otherwise recoverable legacy data.
    if (r) {
      if (typeof r.taskId !== 'string') delete r.taskId;
      if (r.measured !== true) delete r.measured;
    }
    x.snapshot.history.forEach((h) => {
      if (typeof h.taskId !== 'string') delete h.taskId;
      if (h.actualSeconds !== undefined && !num(h.actualSeconds, h.seconds))
        delete h.actualSeconds;
    });
    for (const entry of [...x.snapshot.history, ...(r ? [r] : [])]) {
      for (const key of [
        'plannedFocusSeconds',
        'plannedBreakSeconds',
        'plannedCalendarSeconds',
        'breakSeconds',
      ] as const) {
        if (
          entry[key] !== undefined &&
          !num(entry[key], Number.MAX_SAFE_INTEGER)
        )
          delete entry[key];
      }
      if (typeof entry.blockId !== 'string') delete entry.blockId;
      if (typeof entry.focusRunId !== 'string') delete entry.focusRunId;
    }
    return x;
  } catch {
    return null;
  }
}
export function load(): Saved {
  try {
    return (
      parseSaved(
        JSON.parse(
          workspaceStorage.getItem('lbd-focus-v2-timer') ??
            workspaceStorage.getItem('lbd-focus-v1') ??
            'null',
        ),
      ) ?? structuredClone(initial)
    );
  } catch {
    return structuredClone(initial);
  }
}
export function save(value: Saved): boolean {
  try {
    workspaceStorage.setItem('lbd-focus-v2-timer', JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
