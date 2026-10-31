import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
const password = () => `Lbd-${randomUUID()}!`;
async function login(page: Page, email: string, pass: string) {
  await page.goto('/#Task');
  if (
    !(await page
      .getByRole('region', { name: 'Tài khoản Supabase', exact: true })
      .isVisible())
  )
    await page
      .getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Chọn Đăng nhập', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Tên công việc', { exact: true })).toBeVisible();
}
test('email signup, two-device sync, RLS, logout isolation and consented guest import', async ({
  browser,
  page,
}) => {
  const email = `desktop-${randomUUID()}@example.com`,
    pass = password();
  await page.goto('/#Task');
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Dữ liệu khách giữ nguyên');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  const guest = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-tasks'),
  );
  await page
    .getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true })
    .click();
  await page.getByRole('button', { name: 'Chọn Đăng ký', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
  await page
    .getByRole('button', { name: 'Tạo tài khoản email', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Tên công việc', { exact: true })).toBeVisible();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Xác nhận nhập dữ liệu khách',
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByText(
      'Tôi đồng ý nhập dữ liệu khách trên thiết bị này vào tài khoản đang đăng nhập.',
      { exact: true },
    )
    .check();
  await page
    .getByRole('button', { name: 'Xác nhận nhập dữ liệu khách', exact: true })
    .click();
  await expect(page.locator('.task-card')).toHaveCount(1);
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-tasks')),
  ).toBe(guest);
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Đồng bộ MacBook sang iPhone');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
  await expect(page.locator('.sync-status')).toContainText('Đã đồng bộ', {
    timeout: 15000,
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await login(mobile, email, pass);
  await expect(mobile.locator('.task-card')).toHaveCount(2);
  await mobile
    .getByLabel('Tên công việc', { exact: true })
    .fill('Đồng bộ iPhone về MacBook');
  await mobile.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await mobile
    .getByRole('button', { name: 'Đồng bộ ngay', exact: true })
    .click();
  await expect(mobile.locator('.sync-status')).toContainText('Đã đồng bộ', {
    timeout: 15000,
  });
  await expect(page.locator('.task-card')).toHaveCount(3, { timeout: 15000 });
  const desktopNav = page.getByRole('navigation'),
    mobileNav = mobile.getByRole('navigation');
  await desktopNav
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Habit đồng bộ');
  await page
    .getByLabel('Lịch lặp tự động trên Calendar', { exact: true })
    .uncheck();
  // This test uses today's date; finite/historical rules now enforce selected weekdays.
  for (const day of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
    await page
      .locator('.habit-repeat')
      .getByLabel(day, { exact: true })
      .check();
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Lên lịch Habit đồng bộ', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(1);
  await page.locator('.time-block').first().press('Enter');
  await page.getByLabel('Giờ', { exact: true }).fill('0');
  await page.getByLabel('Phút', { exact: true }).fill('0');
  await page.getByLabel('Giây', { exact: true }).fill('2');
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ghi nhận kết quả phiên', exact: true }),
  ).toBeVisible({ timeout: 8000 });
  await page
    .getByRole('textbox', {
      name: 'Actual Output — Kết quả thực tế',
      exact: true,
    })
    .fill('Đã kiểm tra đồng bộ phiên Focus');
  await page
    .getByRole('button', { name: 'Lưu kết quả phiên', exact: true })
    .click();
  await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
  await expect(page.locator('.sync-status')).toContainText('Đã đồng bộ', {
    timeout: 15000,
  });
  await mobileNav
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await expect(mobile.locator('.habit-table')).toContainText('Habit đồng bộ', {
    timeout: 15000,
  });
  await mobileNav.getByRole('button', { name: 'Lịch', exact: true }).click();
  await expect(mobile.locator('.time-block')).toHaveCount(1);
  await mobileNav.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(
    mobile
      .locator('.history')
      .getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toBeVisible();
  await desktopNav.getByRole('button', { name: 'Task', exact: true }).click();
  await page
    .getByRole('button', { name: 'Sao lưu dữ liệu khách', exact: true })
    .click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.task-card')).toHaveCount(1);
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-tasks')),
  ).toBe(guest);
  const other = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const otherPass = password(),
    otherEmail = `other-${randomUUID()}@example.com`;
  const signup = await other.auth.signUp({
    email: otherEmail,
    password: otherPass,
  });
  expect(signup.error).toBeNull();
  expect(signup.data.user?.id).toBeTruthy();
  const owner = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await owner.auth.signInWithPassword({ email, password: pass })).error,
  ).toBeNull();
  const ownerId = (await owner.auth.getUser()).data.user!.id;
  expect(other.auth.getUser).toBeTruthy();
  expect(signup.data.user!.id).not.toBe(ownerId);
  for (const table of [
    'lbd_tasks',
    'lbd_calendar_blocks',
    'lbd_habits',
    'lbd_focus_sessions',
    'lbd_reviews',
    'lbd_workspaces',
  ]) {
    const owned = await owner.from(table).select('*').eq('user_id', ownerId);
    expect(owned.error).toBeNull();
    expect(owned.data!.length).toBeGreaterThan(0);
    const read = await other.from(table).select('*').eq('user_id', ownerId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const attempted = await other
      .from(table)
      .insert(
        table === 'lbd_workspaces'
          ? { user_id: ownerId }
          : { user_id: ownerId, id: 'foreign', payload: { id: 'foreign' } },
      );
    expect(attempted.error).not.toBeNull();
  }
  const denied = await other.rpc('lbd_read_workspace');
  expect(denied.error).toBeNull();
  expect(denied.data.payload).toBeNull();
  const anon = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false },
  });
  expect((await anon.rpc('lbd_read_workspace')).error).not.toBeNull();
  await login(page, otherEmail, otherPass);
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await login(page, email, pass);
  await expect(page.locator('.task-card')).toHaveCount(4);
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await phone.close();
  await owner.auth.signOut();
  await other.auth.signOut();
});
test('database rejects stale revisions and rolls back an invalid multi-table write', async () => {
  const a = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (
      await a.auth.signUp({
        email: `cas-${randomUUID()}@example.com`,
        password: password(),
      })
    ).error,
  ).toBeNull();
  const session = {
    id: 's',
    name: 'Focus',
    kind: 'study',
    seconds: 1500,
    sound: 'bell',
  };
  const payload = {
    timer: {
      version: 1,
      settings: {
        hours: 0,
        minutes: 25,
        seconds: 0,
        name: 'Focus',
        sessions: [session],
        loop: false,
        volume: 60,
        muted: false,
      },
      snapshot: { run: null, history: [] },
    },
    tasks: {
      version: 1,
      tasks: [
        {
          id: 't',
          title: 'Original',
          notes: '',
          group: 'do',
          color: '',
          completed: false,
        },
      ],
    },
    planner: {
      version: 1,
      blocks: [],
      preferences: { weekStart: 1, blockMinutes: 60 },
    },
    habits: { version: 1, habits: [] },
    reviews: [],
  };
  expect(
    (await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload }))
      .data,
  ).toBe(1);
  const stale = await a.rpc('lbd_commit_workspace', {
    expected_revision: 0,
    payload: { ...payload, tasks: { version: 1, tasks: [] } },
  });
  expect(stale.error?.code).toBe('40001');
  const invalid = structuredClone(payload);
  invalid.tasks.tasks[0].title = 'Should roll back';
  invalid.planner.blocks = [{ id: 'dup' }, { id: 'dup' }] as never[];
  expect(
    (
      await a.rpc('lbd_commit_workspace', {
        expected_revision: 1,
        payload: invalid,
      })
    ).error,
  ).not.toBeNull();
  const read = await a.rpc('lbd_read_workspace');
  expect(read.data.revision).toBe(1);
  expect(read.data.payload.tasks.tasks[0].title).toBe('Original');
  await a.auth.signOut();
});

test('imports a legacy JSON file only after account confirmation, without touching guest storage', async ({
  page,
}) => {
  const client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `file-${randomUUID()}@example.com`,
    pass = password();
  expect(
    (await client.auth.signUp({ email, password: pass })).error,
  ).toBeNull();
  await login(page, email, pass);
  const before = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-tasks'),
  );
  const file = {
    version: 1,
    data: {
      'lbd-focus-v2-tasks': JSON.stringify({
        version: 1,
        tasks: [
          {
            id: 'legacy-file-task',
            title: 'Task từ bản sao lưu V1/V2',
            notes: 'Giữ dữ liệu gốc',
            group: 'do',
            color: '',
            completed: false,
          },
        ],
      }),
    },
  };
  await page
    .getByLabel('Nhập tệp sao lưu JSON', { exact: true })
    .setInputFiles({
      name: 'lbd-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
  await expect(
    page.getByRole('button', {
      name: 'Xác nhận nhập tệp vào tài khoản',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page
    .getByText(
      'Tôi đồng ý nhập dữ liệu từ tệp đã chọn vào tài khoản đang đăng nhập.',
      { exact: true },
    )
    .check();
  await page
    .getByRole('button', {
      name: 'Xác nhận nhập tệp vào tài khoản',
      exact: true,
    })
    .click();
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.sync-status')).toContainText('Đã đồng bộ', {
    timeout: 15000,
  });
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-tasks')),
  ).toBe(before);
  const remote = await client.rpc('lbd_read_workspace');
  expect(remote.error).toBeNull();
  expect(remote.data.payload.tasks.tasks[0].id).toBe('legacy-file-task');
  await client.auth.signOut();
});

test('a new account cannot import or edit an unknown workspace when the initial server read fails', async ({
  page,
}) => {
  const client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `offline-${randomUUID()}@example.com`,
    pass = password();
  expect(
    (await client.auth.signUp({ email, password: pass })).error,
  ).toBeNull();
  await page.route('**/rest/v1/rpc/lbd_read_workspace', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'simulated unavailable service' }),
    }),
  );
  await page.goto('/#Task');
  await page
    .getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.sync-status')).toContainText('Chưa tải được');
  await page
    .getByText(
      'Tôi đồng ý nhập dữ liệu khách trên thiết bị này vào tài khoản đang đăng nhập.',
      { exact: true },
    )
    .check();
  await expect(
    page.getByRole('button', {
      name: 'Xác nhận nhập dữ liệu khách',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveCount(
    0,
  );
  await client.auth.signOut();
});
