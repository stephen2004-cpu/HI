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

it('explicit backup import never restores a permanently deleted habit or its erased log', async () => {
  const { deleteHabit } = await import('./habits');
  const account = emptyWorkspace(),
    guest = emptyWorkspace();
  const habit = {
    id: 'deleted',
    name: 'Old habit',
    category: 'Cá nhân',
    days: [1],
    weeklyTarget: 1,
    minutes: 25,
    archived: false,
    logs: { '2026-10-26': 'done' as const },
  };
  guest.habits.habits = [habit];
  account.habits.habits = [deleteHabit(habit, true, 1234)];
  expect(mergeGuest(account, guest).habits.habits[0].logs).toEqual({});
  expect(mergeGuest(guest, account).habits.habits[0].deletedAt).toBe(1234);
});

it('requires a server read-back tombstone before confirming deletion; revision-only writes and read failures do not confirm', async () => {
  const { deletionStatus } = await import('./habitDeletionStatus');
  const id = 'deletion-readback';
  const w = emptyWorkspace();
  const h = {
    id: 'gym',
    name: 'GYM',
    category: 'Cá nhân',
    days: [1],
    weeklyTarget: 1,
    minutes: 25,
    archived: true,
    deletedAt: 123456,
    logs: { '2026-10-26': 'done' as const },
  };
  w.habits.habits = [h];
  storeWorkspace(id, w);
  writeMeta(id, { revision: 0, dirty: true });
  let readError = false,
    accepted = false;
  const client = {
    rpc: vi.fn(async (name: string) => {
      if (name === 'lbd_commit_workspace') {
        accepted = true;
        return { data: 1, error: null };
      }
      if (readError) return { data: null, error: { code: 'NETWORK' } };
      return {
        data: {
          revision: accepted ? 1 : 0,
          payload: accepted ? w : emptyWorkspace(),
        },
        error: null,
      };
    }),
  } as unknown as SupabaseClient;
  const engine = new WorkspaceSync(client, id, vi.fn());
  await engine.start();
  expect(deletionStatus(h, id).phase).toBe('pending');
  readError = true;
  await engine.tick();
  expect(deletionStatus(h, id).phase).toBe('error');
  expect(readWorkspace(id).habits.habits[0]).toEqual(h);
  readError = false;
  await engine.tick();
  expect(deletionStatus(h, id).phase).toBe('confirmed');
  expect(deletionStatus(h, null).phase).toBe('local');
  engine.stop();
});
it('does not accept a revision when the server read lacks the requested deletion and preserves edits during later read-back', async () => {
  const { deletionStatus } = await import('./habitDeletionStatus');
  const id = 'missing-server-marker';
  const w = emptyWorkspace();
  w.habits.habits = [
    {
      id: 'gym',
      name: 'GYM',
      category: 'Cá nhân',
      days: [1],
      weeklyTarget: 1,
      minutes: 25,
      archived: true,
      deletedAt: 777,
      logs: {},
    },
  ];
  storeWorkspace(id, w);
  writeMeta(id, { revision: 0, dirty: true });
  let reads = 0,
    accept = false;
  const client = {
    rpc: vi.fn(async (name: string) => {
      if (name === 'lbd_commit_workspace')
        return { data: ++reads, error: null };
      return {
        data: { revision: reads, payload: accept ? w : emptyWorkspace() },
        error: null,
      };
    }),
  } as unknown as SupabaseClient;
  const e = new WorkspaceSync(client, id, vi.fn());
  await e.start();
  await e.tick();
  expect(e.status).toBe('error');
  expect(readMeta(id).dirty).toBe(true);
  expect(deletionStatus(w.habits.habits[0], id).phase).toBe('error');
  accept = true;
  await e.tick();
  expect(deletionStatus(w.habits.habits[0], id).phase).toBe('confirmed');
  e.stop();
});
