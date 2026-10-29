import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { emptyWorkspace } from '../src/workspace';
import { setHabitSchedule, deleteHabit, type Habit } from '../src/habits';
import { begin, record } from '../src/engine';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
const client = () =>
  createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
function fixture() {
  const w = emptyWorkspace(),
    now = Date.now();
  const h: Habit = setHabitSchedule(
    {
      id: randomUUID(),
      name: 'Xóa an toàn',
      category: 'Cá nhân',
      days: [0, 1, 2, 3, 4, 5, 6],
      weeklyTarget: 7,
      minutes: 25,
      archived: false,
      logs: { '2026-10-26': 'done' },
    },
    '2026-10-26',
    '09:00',
  );
  w.habits.habits = [h];
  w.tasks.tasks = [
    {
      id: 'independent',
      title: 'Task độc lập',
      notes: '',
      group: 'do',
      color: '',
      completed: false,
    },
  ];
  w.planner.blocks = [
    {
      id: 'future',
      taskId: 'habit-occurrence',
      title: h.name,
      start: now + 86400000,
      end: now + 90000000,
      color: '',
      recurringHabitId: h.id,
      habitDate: '2026-11-01',
    },
  ];
  const run = begin(
    'timer',
    [
      {
        id: 's',
        name: 'Giữ Focus History',
        kind: 'study',
        seconds: 60,
        sound: 'bell',
      },
    ],
    false,
    now - 120000,
  );
  run.taskId = 'habit-occurrence';
  w.timer.snapshot.history = [record(run, now - 60000, 'completed')];
  return { w, h };
}
async function login(page: Page, email: string, password: string) {
  await page.goto('/?auth=login#Thói%20quen');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Sửa thói quen Xóa an toàn',
      exact: true,
    }),
  ).toBeVisible();
}

test('permanent deletion survives offline device conflicts, use-local, refresh, logout/login and legacy writes; ledger RLS isolates owners', async ({
  browser,
}) => {
  const a = client(),
    email = `deletion-${randomUUID()}@example.com`,
    pass = `Lbd-${randomUUID()}!`,
    { w, h } = fixture();
  const signup = await a.auth.signUp({ email, password: pass });
  expect(signup.error === null).toBe(true);
  expect(
    (await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload: w }))
      .error === null,
  ).toBe(true);
  const desktop = await browser.newContext(),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const p = await desktop.newPage(),
    q = await phone.newPage();
  await login(p, email, pass);
  await login(q, email, pass);
  await phone.setOffline(true);
  await q
    .getByRole('button', { name: 'Sửa thói quen Xóa an toàn', exact: true })
    .click();
  await q
    .getByLabel('Tên thói quen', { exact: true })
    .fill('Bản chỉnh offline');
  await q.getByRole('button', { name: 'Lưu thói quen', exact: true }).click();
  await p
    .getByRole('button', { name: 'Sửa thói quen Xóa an toàn', exact: true })
    .click();
  await p.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  await p
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  await expect(p.locator('.habit-table tbody tr')).toHaveCount(0);
  await expect(p.locator('.sync-status')).toContainText('Đã đồng bộ', {
    timeout: 15000,
  });
  await p.reload();
  await expect(p.locator('.habit-table tbody tr')).toHaveCount(0);
  if (
    !(await p
      .getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true })
      .isVisible())
  )
    await p
      .getByRole('button', { name: 'Tài khoản & đồng bộ', exact: true })
      .click();
  await p.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await loginAfterDeletion(p, email, pass);
  await phone.setOffline(false);
  await expect(q.locator('.sync-status')).toContainText(/thay đổi|thiết bị/, {
    timeout: 15000,
  });
  await expect(q.locator('.habit-table tbody tr')).toHaveCount(0);
  if (
    !(await q
      .getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true })
      .isVisible())
  )
    await q
      .getByRole('button', { name: 'Tài khoản & đồng bộ', exact: true })
      .click();
  q.once('dialog', (d) => d.accept());
  await q
    .getByRole('button', { name: 'Dùng bản thiết bị này', exact: true })
    .click();
  await expect(q.locator('.habit-table tbody tr')).toHaveCount(0);
  await expect(q.locator('.sync-status')).toContainText('Đã đồng bộ', {
    timeout: 15000,
  });
  const current = await a.rpc('lbd_read_workspace');
  expect(current.data.payload.habits.habits[0].deletedAt > 0).toBe(true);
  expect(current.data.payload.habits.habits[0].logs).toEqual(h.logs);
  expect(current.data.payload.timer.snapshot.history).toEqual(
    w.timer.snapshot.history,
  );
  expect(
    current.data.payload.tasks.tasks.some(
      (t: { id: string }) => t.id === 'independent',
    ),
  ).toBe(true);
  expect(current.data.payload.planner.blocks[0].cancelled).toBe(true);
  // A pre-upgrade browser can intentionally upload its entire stale snapshot.
  // Even with a fresh revision this cannot resurrect the permanent ID.
  expect(
    (
      await a.rpc('lbd_commit_workspace', {
        expected_revision: current.data.revision,
        payload: w,
      })
    ).error === null,
  ).toBe(true);
  const restored = await a.rpc('lbd_read_workspace');
  expect(restored.data.payload.habits.habits[0].deletedAt > 0).toBe(true);
  expect(restored.data.payload.planner.blocks[0].cancelled).toBe(true);
  const legacy = structuredClone(w);
  legacy.planner.blocks[0].id = `habit-block:${h.id}:2026-11-01`;
  delete legacy.planner.blocks[0].recurringHabitId;
  expect(
    (
      await a.rpc('lbd_commit_workspace', {
        expected_revision: restored.data.revision,
        payload: legacy,
      })
    ).error === null,
  ).toBe(true);
  expect(
    (await a.rpc('lbd_read_workspace')).data.payload.planner.blocks[0]
      .cancelled,
  ).toBe(true);
  await a.from('lbd_habits').delete().eq('id', h.id);
  expect(
    (await a.rpc('lbd_read_workspace')).data.payload.habits.habits[0]
      .deletedAt > 0,
  ).toBe(true);
  const other = client();
  await other.auth.signUp({
    email: `other-${randomUUID()}@example.com`,
    password: `Lbd-${randomUUID()}!`,
  });
  expect((await other.from('lbd_habit_deletions').select('id')).data).toEqual(
    [],
  );
  expect(
    (
      await other
        .from('lbd_habit_deletions')
        .insert({ user_id: signup.data.user!.id, id: h.id, payload: {} })
    ).error !== null,
  ).toBe(true);
  expect(
    (await a.from('lbd_habit_deletions').delete().eq('id', h.id)).error !==
      null,
  ).toBe(true);
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
  await other.auth.signOut();
});
async function loginAfterDeletion(page: Page, email: string, password: string) {
  await page.goto('/?auth=login#Thói%20quen');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Thói quen của tôi', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.habit-table tbody tr')).toHaveCount(0);
}

test('history purge cannot be undone by a stale snapshot; an absent migration blocks account deletion without changing data', async ({
  page,
}) => {
  const a = client(),
    email = `purge-${randomUUID()}@example.com`,
    pass = `Lbd-${randomUUID()}!`,
    { w, h } = fixture();
  await a.auth.signUp({ email, password: pass });
  await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload: w });
  await login(page, email, pass);
  await page.route('**/rest/v1/rpc/lbd_habit_deletion_capabilities', (r) =>
    r.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'missing migration' }),
    }),
  );
  await page
    .getByRole('button', { name: 'Sửa thói quen Xóa an toàn', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'migration' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Sửa thói quen Xóa an toàn',
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute('**/rest/v1/rpc/lbd_habit_deletion_capabilities');
  const current = await a.rpc('lbd_read_workspace');
  const dead = structuredClone(current.data.payload);
  dead.habits.habits = [deleteHabit(h, true)];
  expect(
    (
      await a.rpc('lbd_commit_workspace', {
        expected_revision: current.data.revision,
        payload: dead,
      })
    ).error === null,
  ).toBe(true);
  expect(
    (
      await a.rpc('lbd_commit_workspace', {
        expected_revision: current.data.revision + 1,
        payload: w,
      })
    ).error === null,
  ).toBe(true);
  const read = await a.rpc('lbd_read_workspace');
  expect(read.data.payload.habits.habits[0].logs).toEqual({});
  expect(read.data.payload.habits.habits[0].deletedHistory).toBe(true);
  expect(read.data.payload.timer.snapshot.history).toEqual(
    w.timer.snapshot.history,
  );
  await a.auth.signOut();
});
