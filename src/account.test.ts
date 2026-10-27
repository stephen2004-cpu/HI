import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  getItem,
  setItem,
  setWorkspaceUser,
  readMeta,
  writeMeta,
  scopedKey,
} from './workspaceStorage';
import {
  emptyWorkspace,
  mergeGuest,
  readWorkspace,
  storeWorkspace,
  parseBackup,
  workspaceFingerprint,
} from './workspace';
import { WorkspaceSync } from './sync';
import type { SupabaseClient } from '@supabase/supabase-js';
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  setWorkspaceUser(null);
});
afterEach(() => {
  setWorkspaceUser(null);
  vi.unstubAllGlobals();
});
it('separates guest and each user and never exposes the V1 fallback to an account', () => {
  values.set('lbd-focus-v1', 'legacy');
  setItem('lbd-focus-v2-tasks', 'guest');
  setWorkspaceUser('a');
  expect(getItem('lbd-focus-v1')).toBeNull();
  expect(getItem('lbd-focus-v2-tasks')).toBeNull();
  setItem('lbd-focus-v2-tasks', 'A');
  setWorkspaceUser('b');
  expect(getItem('lbd-focus-v2-tasks')).toBeNull();
  setItem('lbd-focus-v2-tasks', 'B');
  setWorkspaceUser(null);
  expect(getItem('lbd-focus-v2-tasks')).toBe('guest');
  expect(values.get('lbd-focus-v1')).toBe('legacy');
  expect(readMeta('a').dirty).toBe(true);
});
it('imports only on explicit merge, retaining account collisions, guest data and active guest timer', () => {
  const guest = emptyWorkspace(),
    account = emptyWorkspace();
  guest.tasks.tasks = [
    {
      id: 'same',
      title: 'Guest',
      notes: '',
      group: 'do',
      color: '',
      completed: false,
    },
  ];
  account.tasks.tasks = [{ ...guest.tasks.tasks[0], title: 'Account' }];
  guest.timer.snapshot.run = {
    mode: 'timer',
    sessions: [
      {
        id: 's',
        kind: 'study',
        seconds: 10,
        name: 'Guest timer',
        sound: 'silent',
      },
    ],
    index: 0,
    remaining: 10000,
    started: 1,
    deadline: 10001,
    status: 'running',
    loop: false,
  };
  const result = mergeGuest(account, guest);
  expect(result.tasks.tasks[0].title).toBe('Account');
  expect(result.timer.snapshot.run).toBeNull();
  expect(guest.timer.snapshot.run).not.toBeNull();
  expect(values.size).toBe(0);
});
it('keeps local pending changes on offline failure and stale revisions instead of overwriting', async () => {
  storeWorkspace('a', emptyWorkspace());
  writeMeta('a', { revision: 1, dirty: true });
  const client = {
    rpc: vi.fn(async (name: string) =>
      name === 'lbd_read_workspace'
        ? { data: { revision: 2, payload: emptyWorkspace() }, error: null }
        : { data: null, error: { code: '40001' } },
    ),
  } as unknown as SupabaseClient;
  const status = vi.fn(),
    engine = new WorkspaceSync(client, 'a', status);
  await engine.start();
  expect(engine.status).toBe('conflict');
  expect(readMeta('a').dirty).toBe(true);
  engine.stop();
});
it('does not apply an in-flight response after sign-out/switch', async () => {
  let resolve!: (x: unknown) => void;
  const pending = new Promise((r) => (resolve = r));
  const client = { rpc: () => pending } as unknown as SupabaseClient;
  const engine = new WorkspaceSync(client, 'a', vi.fn());
  const start = engine.start();
  engine.stop();
  setWorkspaceUser('b');
  resolve({ data: { revision: 2, payload: emptyWorkspace() }, error: null });
  await start;
  expect(values.has(scopedKey('lbd-focus-v2-timer', 'a'))).toBe(false);
  expect(values.has(scopedKey('lbd-focus-v2-timer', 'b'))).toBe(false);
});
it('preserves edits made during an upload for the next CAS commit', async () => {
  storeWorkspace('a', emptyWorkspace());
  writeMeta('a', { revision: 0, dirty: true });
  let finish!: (x: unknown) => void;
  const client = {
    rpc: vi.fn((name: string) =>
      name === 'lbd_read_workspace'
        ? Promise.resolve({ data: { revision: 0, payload: null }, error: null })
        : new Promise((r) => (finish = r)),
    ),
  } as unknown as SupabaseClient;
  const e = new WorkspaceSync(client, 'a', vi.fn());
  await e.start();
  const upload = e.tick();
  setWorkspaceUser('a');
  const edited = readWorkspace('a');
  edited.timer.settings.name = 'New edit';
  setItem('lbd-focus-v2-timer', JSON.stringify(edited.timer));
  finish({ data: 1, error: null });
  await upload;
  expect(readMeta('a')).toEqual({ revision: 1, dirty: true });
  expect(readWorkspace('a').timer.settings.name).toBe('New edit');
  e.stop();
});

it('validates legacy JSON backups without importing credentials or mutating storage', () => {
  const guest = emptyWorkspace();
  const source = JSON.stringify({
    version: 1,
    data: {
      'lbd-focus-v1': JSON.stringify(guest.timer),
      'lbd-focus-v2-tasks': JSON.stringify(guest.tasks),
      'auth-token': 'ignored',
    },
  });
  expect(parseBackup(source)).toEqual(guest);
  expect(values.size).toBe(0);
  expect(() => parseBackup('{bad')).toThrow();
  expect(() =>
    parseBackup(JSON.stringify({ version: 2, data: guest })),
  ).toThrow();
});
it('compares workspace records independently of SQL row/key order while preserving checklist order', () => {
  const a = emptyWorkspace();
  a.tasks.tasks = [
    {
      id: 'x',
      title: 'Task',
      notes: '',
      group: 'do',
      color: '',
      completed: false,
      checklist: [
        { id: '1', text: 'A', done: false },
        { id: '2', text: 'B', done: false },
      ],
    },
  ];
  const b = structuredClone(a);
  b.tasks.tasks[0].checklist!.reverse();
  expect(workspaceFingerprint(a)).not.toBe(workspaceFingerprint(b));
});

it('acknowledges identical concurrent results without losing edits or duplicating sessions', async () => {
  const w = emptyWorkspace();
  storeWorkspace('a', w);
  writeMeta('a', { revision: 1, dirty: true });
  let reads = 0;
  const client = {
    rpc: vi.fn(async (name: string) =>
      name === 'lbd_read_workspace'
        ? { data: { revision: ++reads === 1 ? 1 : 2, payload: w }, error: null }
        : { data: null, error: { code: '40001' } },
    ),
  } as unknown as SupabaseClient;
  const e = new WorkspaceSync(client, 'a', vi.fn());
  await e.start();
  await e.tick();
  expect(e.status).toBe('synced');
  expect(readMeta('a')).toEqual({ revision: 2, dirty: false });
  e.stop();
});
