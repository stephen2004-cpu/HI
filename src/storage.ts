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
export function load(): Saved {
  try {
    const x = JSON.parse(
      localStorage.getItem('lbd-focus-v1') || 'null',
    ) as Saved;
    if (!x || x.version !== 1) return structuredClone(initial);
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
      return structuredClone(initial);
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
      return structuredClone(initial);
    if (!Array.isArray(x.snapshot?.history)) return structuredClone(initial);
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
    return x;
  } catch {
    return structuredClone(initial);
  }
}
export function save(value: Saved): boolean {
  try {
    localStorage.setItem('lbd-focus-v1', JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
