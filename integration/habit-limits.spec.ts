import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { emptyWorkspace } from '../src/workspace';
import { setHabitSchedule } from '../src/habits';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
async function login(page: Page, email: string, password: string) {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
  await page.goto('/?auth=login#Thói%20quen');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Sửa thói quen Habit giới hạn đồng bộ',
      exact: true,
    }),
  ).toBeVisible();
}
test('finite Habit rules sync across two devices without duplicate occurrences and server confirms deletion only after a read', async ({
  browser,
}) => {
  const a = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `limits-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  const signup = await a.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const user = signup.data.user!.id;
  const w = emptyWorkspace();
  w.habits.habits = [
    setHabitSchedule(
      {
        id: 'limited',
        name: 'Habit giới hạn đồng bộ',
        category: 'Cá nhân',
        days: [1, 3, 5],
        weeklyTarget: 3,
        minutes: 25,
        archived: false,
        logs: { '2026-10-26': 'done' },
      },
      '2026-10-26',
      '09:00',
      new Date(2026, 9, 26),
      { type: 'count', count: 6 },
    ),
  ];
  w.tasks.tasks = [
    {
      id: 'independent',
      title: 'Giữ Task độc lập',
      notes: 'Không đổi',
      group: 'do',
      color: '',
      completed: false,
    },
  ];
  expect(
    (await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload: w }))
      .error,
  ).toBeNull();
  const desktop = await browser.newContext(),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const p = await desktop.newPage(),
    q = await phone.newPage();
  await login(p, email, password);
  await login(q, email, password);
  await p
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(p.locator('.time-block')).toHaveCount(3);
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await p.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(p.locator('.time-block')).toHaveCount(3);
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await p.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(p.locator('.time-block')).toHaveCount(0);
  await p
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await p
    .getByRole('button', {
      name: 'Sửa thói quen Habit giới hạn đồng bộ',
      exact: true,
    })
    .click();
  await p.getByLabel('Số lần xuất hiện', { exact: true }).fill('10');
  await p.getByRole('button', { name: 'Lưu thói quen', exact: true }).click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await expect
    .poll(
      () =>
        q.evaluate(
          (user) =>
            JSON.parse(
              localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-habits`)!,
            ).habits[0].recurrence.rules.at(-1).ending.count,
          user,
        ),
      { timeout: 15000 },
    )
    .toBe(10);
  await p
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await p.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await p.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(p.locator('.time-block')).toHaveCount(3);
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  let server = (await a.rpc('lbd_read_workspace')).data.payload;
  expect(
    new Set(server.planner.blocks.map((b: { id: string }) => b.id)).size,
  ).toBe(server.planner.blocks.length);
  expect(server.habits.habits[0].logs).toEqual(w.habits.habits[0].logs);
  await p
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await p
    .getByRole('button', {
      name: 'Sửa thói quen Habit giới hạn đồng bộ',
      exact: true,
    })
    .click();
  await p.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  await p.route('**/rest/v1/rpc/lbd_read_workspace', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'local test read unavailable' }),
    }),
  );
  await p
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  await expect(p.locator('[data-deletion-phase="error"]')).toContainText(
    'chưa xác nhận trên máy chủ',
    { timeout: 15000 },
  );
  await expect(p.locator('[data-deletion-phase="confirmed"]')).toHaveCount(0);
  await p.unroute('**/rest/v1/rpc/lbd_read_workspace');
  await expect(p.locator('[data-deletion-phase="confirmed"]')).toContainText(
    'Đã đồng bộ xóa thành công',
    { timeout: 15000 },
  );
  await expect(q.locator('.habit-table tbody tr')).toHaveCount(0, {
    timeout: 15000,
  });
  await p.reload();
  await expect(p.locator('[data-deletion-phase="confirmed"]')).toBeVisible();
  await p
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(p.locator('.time-block')).toHaveCount(0);
  await p.getByLabel('Chế độ lịch').selectOption('month');
  await expect(p.locator('.month-block')).toHaveCount(0);
  server = (await a.rpc('lbd_read_workspace')).data.payload;
  expect(
    server.tasks.tasks.some((t: { id: string }) => t.id === 'independent'),
  ).toBe(true);
  expect(server.timer.snapshot.history).toEqual(w.timer.snapshot.history);
  expect(server.habits.habits[0].logs).toEqual(w.habits.habits[0].logs);
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
});
