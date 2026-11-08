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
import {
  WorkspaceSync,
  SYNC_READ_TIMEOUT_MS,
  SYNC_WRITE_TIMEOUT_MS,
} from './sync';
import { hasCachedWorkspace } from './workspace';
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
  vi.useRealTimers();
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
  const local = emptyWorkspace();
  local.timer.settings.name = 'Unsynced edit';
  storeWorkspace('a', local);
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
  const pending = emptyWorkspace();
  pending.timer.settings.name = 'Pending edit';
  storeWorkspace('a', pending);
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

it('opens only a complete validated cache belonging to this account, never guest/partial/incoming/corrupt documents', () => {
  storeWorkspace('guest', emptyWorkspace());
  expect(hasCachedWorkspace('a')).toBe(false);
  storeWorkspace('a', emptyWorkspace());
  expect(hasCachedWorkspace('a')).toBe(true);
  values.set('lbd-account:a:incoming', JSON.stringify(emptyWorkspace()));
  expect(hasCachedWorkspace('a')).toBe(false);
  values.delete('lbd-account:a:incoming');
  values.set(scopedKey('lbd-focus-v2-tasks', 'a'), '{invalid');
  expect(hasCachedWorkspace('a')).toBe(false);
  expect(values.get(scopedKey('lbd-focus-v2-tasks', 'a'))).toBe('{invalid');
});
it('times out a hung first read, ignores its late result and allows retry without writing an empty account', async () => {
  vi.useFakeTimers();
  let late!: (value: unknown) => void;
  let requests = 0;
  const client = {
    rpc: vi.fn(() =>
      ++requests === 1
        ? new Promise((resolve) => {
            late = resolve;
          })
        : Promise.resolve({
            data: { revision: 2, payload: emptyWorkspace() },
            error: null,
          }),
    ),
  } as unknown as SupabaseClient;
  const e = new WorkspaceSync(client, 'a', vi.fn());
  const start = e.start();
  await vi.advanceTimersByTimeAsync(SYNC_READ_TIMEOUT_MS);
  await start;
  expect(e.status).toBe('error');
  expect(e.message).toContain('phản hồi quá lâu');
  expect(hasCachedWorkspace('a')).toBe(false);
  late({ data: { revision: 99, payload: emptyWorkspace() }, error: null });
  await Promise.resolve();
  expect(hasCachedWorkspace('a')).toBe(false);
  await e.retry();
  expect(e.status).toBe('synced');
  expect(readMeta('a')).toEqual({ revision: 2, dirty: false });
  e.stop();
});
it.each([0, 2])(
  'protects edits made while the initial read is pending (server revision %i)',
  async (revision) => {
    const original = emptyWorkspace();
    storeWorkspace('a', original);
    writeMeta('a', { revision: 0, dirty: false });
    let finish!: (value: unknown) => void;
    const client = {
      rpc: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    } as unknown as SupabaseClient;
    const e = new WorkspaceSync(client, 'a', vi.fn());
    const start = e.start();
    setWorkspaceUser('a');
    const edited = readWorkspace('a');
    edited.timer.settings.name = 'Edit during slow first request';
    setItem('lbd-focus-v2-timer', JSON.stringify(edited.timer));
    e.localChanged();
    expect(e.status).toBe('loading');
    finish({ data: { revision, payload: original }, error: null });
    await start;
    expect(readWorkspace('a').timer.settings.name).toBe(
      'Edit during slow first request',
    );
    expect(readMeta('a').dirty).toBe(true);
    expect(e.status).toBe(revision === 0 ? 'pending' : 'conflict');
    e.stop();
  },
);
it('does not rewrite or remount an identical cached workspace on startup', async () => {
  const w = emptyWorkspace();
  storeWorkspace('a', w);
  writeMeta('a', { revision: 1, dirty: false });
  const changed = vi.fn();
  const e = new WorkspaceSync(
    {
      rpc: async () => ({ data: { revision: 1, payload: w }, error: null }),
    } as unknown as SupabaseClient,
    'a',
    changed,
  );
  await e.start();
  expect(e.status).toBe('synced');
  expect(changed.mock.calls.every((args) => !args[2])).toBe(true);
  expect(readWorkspace('a')).toEqual(w);
  e.stop();
});
it.each([false, true])(
  'finishes manual retry when a cached workspace has the same server revision (initial read failed: %s)',
  async (initialFailure) => {
    const w = emptyWorkspace();
    storeWorkspace('a', w);
    writeMeta('a', { revision: 1, dirty: false });
    let reads = 0;
    const rpc = vi.fn(async (_name: string) =>
      initialFailure && ++reads === 1
        ? { data: null, error: { code: 'PGRST002' } }
        : { data: { revision: 1, payload: w }, error: null },
    );
    const changed = vi.fn();
    const e = new WorkspaceSync(
      { rpc } as unknown as SupabaseClient,
      'a',
      changed,
    );
    try {
      await e.start();
      expect(e.status).toBe(initialFailure ? 'error' : 'synced');
      await e.retry();
      expect(e.status).toBe('synced');
      await e.retry();
      expect(e.status).toBe('synced');
      expect(readMeta('a')).toEqual({ revision: 1, dirty: false });
      expect(readWorkspace('a')).toEqual(w);
      expect(
        rpc.mock.calls.every(([name]) => name === 'lbd_read_workspace'),
      ).toBe(true);
      expect(changed.mock.calls.every((args) => !args[2])).toBe(true);
    } finally {
      e.stop();
    }
  },
);
it('keeps an edit pending when it is saved during an unchanged-revision retry', async () => {
  const w = emptyWorkspace();
  storeWorkspace('a', w);
  writeMeta('a', { revision: 1, dirty: false });
  let finish!: (value: unknown) => void;
  let reads = 0;
  const rpc = vi.fn((_name: string) =>
    ++reads === 1
      ? Promise.resolve({ data: { revision: 1, payload: w }, error: null })
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  try {
    await e.start();
    const retry = e.retry();
    setWorkspaceUser('a');
    const edited = readWorkspace('a');
    edited.timer.settings.name = 'Keep edit made during retry';
    setItem('lbd-focus-v2-timer', JSON.stringify(edited.timer));
    finish({ data: { revision: 1, payload: w }, error: null });
    await retry;
    expect(e.status).toBe('pending');
    expect(readMeta('a')).toEqual({ revision: 1, dirty: true });
    expect(readWorkspace('a').timer.settings.name).toBe(
      'Keep edit made during retry',
    );
  } finally {
    e.stop();
  }
});
it('an upload timeout retains the dirty snapshot and releases the lock for a safe retry', async () => {
  vi.useFakeTimers();
  const w = emptyWorkspace();
  w.timer.settings.name = 'Keep pending work';
  storeWorkspace('a', w);
  writeMeta('a', { revision: 1, dirty: true });
  let writes = 0;
  const rpc = vi.fn((name: string) =>
    name === 'lbd_read_workspace'
      ? Promise.resolve({
          data: { revision: 1, payload: emptyWorkspace() },
          error: null,
        })
      : ++writes === 1
        ? new Promise(() => {})
        : Promise.resolve({ data: 2, error: null }),
  );
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  const upload = e.tick();
  await vi.advanceTimersByTimeAsync(SYNC_WRITE_TIMEOUT_MS);
  await upload;
  expect(e.status).toBe('error');
  expect(readMeta('a')).toEqual({ revision: 1, dirty: true });
  expect(readWorkspace('a')).toEqual(w);
  await e.retry();
  expect(readMeta('a')).toEqual({ revision: 2, dirty: false });
  expect(e.status).toBe('synced');
  e.stop();
});
it('stops idle polling in hidden tabs, resumes on visibility and still uploads hidden pending work', async () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'hidden',
    activeElement: null,
  });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  storeWorkspace('a', emptyWorkspace());
  writeMeta('a', { revision: 1, dirty: false });
  const rpc = vi.fn(async (name: string) =>
    name === 'lbd_read_workspace'
      ? { data: { revision: 1, payload: emptyWorkspace() }, error: null }
      : { data: 2, error: null },
  );
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  await vi.advanceTimersByTimeAsync(9000);
  expect(rpc).toHaveBeenCalledTimes(1);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
  doc.visibilityState = 'hidden';
  const changed = readWorkspace('a');
  changed.timer.settings.name = 'Changed while hidden';
  storeWorkspace('a', changed);
  writeMeta('a', { revision: 1, dirty: true });
  await vi.advanceTimersByTimeAsync(3000);
  expect(rpc.mock.calls.some(([name]) => name === 'lbd_commit_workspace')).toBe(
    true,
  );
  expect(readMeta('a').dirty).toBe(false);
  e.stop();
  const count = rpc.mock.calls.length;
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(6000);
  expect(rpc).toHaveBeenCalledTimes(count);
});

it('does not replace a warm workspace while the user is typing an unsaved form', async () => {
  const w = emptyWorkspace();
  storeWorkspace('a', w);
  writeMeta('a', { revision: 1, dirty: false });
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), {
      activeElement: { matches: () => true, closest: () => ({}) },
    }),
  );
  const remote = structuredClone(w);
  remote.timer.settings.name = 'New server settings';
  const e = new WorkspaceSync(
    {
      rpc: async () => ({
        data: { revision: 2, payload: remote },
        error: null,
      }),
    } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  expect(e.status).toBe('remote-waiting');
  expect(readWorkspace('a').timer.settings.name).toBe(w.timer.settings.name);
  expect(readMeta('a')).toEqual({ revision: 1, dirty: false });
  e.stop();
});

it('acknowledges identical record/key order changes without another database write', async () => {
  const w = emptyWorkspace();
  w.tasks.tasks = [
    {
      id: 'a',
      title: 'Keep',
      group: 'do',
      notes: '',
      color: '',
      completed: false,
    },
    {
      id: 'b',
      title: 'Keep second',
      group: 'do',
      notes: '',
      color: '',
      completed: false,
    },
  ];
  const local = structuredClone(w);
  local.tasks.tasks.reverse();
  storeWorkspace('a', local);
  writeMeta('a', { revision: 1, dirty: true });
  const rpc = vi.fn(async () => ({
    data: { revision: 2, payload: w },
    error: null,
  }));
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  expect(readMeta('a')).toEqual({ revision: 2, dirty: false });
  expect(rpc.mock.calls).toHaveLength(1);
  expect(readWorkspace('a').tasks.tasks).toEqual(local.tasks.tasks);
  e.stop();
});
it('does not commit pending local data while the initial server read keeps failing', async () => {
  const w = emptyWorkspace();
  w.timer.settings.name = 'Keep offline work';
  storeWorkspace('a', w);
  writeMeta('a', { revision: 1, dirty: true });
  const rpc = vi.fn(async (_name: string) => ({
    data: null,
    error: { code: 'NETWORK' },
  }));
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  await e.tick();
  expect(rpc.mock.calls.every(([name]) => name === 'lbd_read_workspace')).toBe(
    true,
  );
  expect(readMeta('a').dirty).toBe(true);
  expect(readWorkspace('a')).toEqual(w);
  e.stop();
});
it('does not resend an already accepted unchanged snapshot when a dirty event repeats', async () => {
  const w = emptyWorkspace();
  storeWorkspace('a', w);
  writeMeta('a', { revision: 0, dirty: false });
  const rpc = vi.fn(async (name: string) =>
    name === 'lbd_read_workspace'
      ? { data: { revision: 0, payload: w }, error: null }
      : { data: 1, error: null },
  );
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  setWorkspaceUser('a');
  const changed = readWorkspace('a');
  changed.timer.settings.name = 'Real edit';
  setItem('lbd-focus-v2-timer', JSON.stringify(changed.timer));
  await e.tick();
  writeMeta('a', { revision: 1, dirty: true });
  await e.tick();
  expect(
    rpc.mock.calls.filter(([name]) => name === 'lbd_commit_workspace'),
  ).toHaveLength(1);
  expect(readMeta('a')).toEqual({ revision: 1, dirty: false });
  e.stop();
});
it('backs off automatic retries after server errors while allowing one explicit retry', async () => {
  vi.useFakeTimers();
  const rpc = vi.fn(async (_name: string) => ({
    data: null,
    error: { code: 'NETWORK' },
  }));
  const e = new WorkspaceSync(
    { rpc } as unknown as SupabaseClient,
    'a',
    vi.fn(),
  );
  await e.start();
  await vi.advanceTimersByTimeAsync(3000);
  expect(rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(rpc).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(9000);
  expect(rpc).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3000);
  expect(rpc).toHaveBeenCalledTimes(3);
  await e.retry();
  expect(rpc).toHaveBeenCalledTimes(4);
  e.stop();
});
