import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
async function login(
  page: Page,
  email: string,
  password: string,
  user: string,
) {
  await page.clock.setSystemTime(new Date(2026, 9, 31, 8));
  await page.goto('/?auth=login#Task');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(
          (user) =>
            localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-planner`) !==
            null,
          user,
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
}
const local = (p: Page, user: string) =>
  p.evaluate(
    (user) =>
      JSON.parse(
        localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-planner`) ??
          '{"blocks":[]}',
      ).blocks,
    user,
  );
test('timed Task repeats create and synchronize four blocks on desktop/mobile, preserve edits and deletion after reload', async ({
  browser,
}) => {
  const a = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `auto-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  const signup = await a.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const user = signup.data.user!.id;
  const desktop = await browser.newContext(),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const p = await desktop.newPage(),
    q = await phone.newPage();
  await login(p, email, password, user);
  await p.getByLabel('Tên công việc', { exact: true }).fill('Học VNR');
  await p.getByLabel('Kiểu lặp Task').selectOption('weekly');
  await p
    .getByLabel('Ngày bắt đầu Task lặp', { exact: true })
    .fill('2026-10-31');
  for (const d of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
    await p
      .getByLabel(`Task lặp ${d}`, { exact: true })
      .setChecked(d === 'T3' || d === 'T6');
  await p.getByRole('radio', { name: /Sau/ }).check();
  await p.getByLabel('Số lần Task xuất hiện', { exact: true }).fill('4');
  await p
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-10-31T09:00');
  await p.getByLabel('Giờ kết thúc Task lặp', { exact: true }).fill('11:15');
  await p.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  let server = (await a.rpc('lbd_read_workspace')).data;
  expect(server.payload.planner.blocks).toHaveLength(4);
  expect(
    server.payload.planner.blocks.every(
      (b: { start: number; end: number }) => b.end - b.start === 135 * 60000,
    ),
  ).toBe(true);
  const original = server.payload.planner.blocks;
  await login(q, email, password, user);
  await expect.poll(() => local(q, user)).toEqual(original);
  await q.goto('/#Lịch');
  await q.getByLabel('Chế độ lịch').selectOption('month');
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  expect(await local(q, user)).toEqual(original);
  await q.reload();
  await expect.poll(() => local(q, user)).toEqual(original);
  await p.goto('/#Task');
  await p.getByRole('button', { name: 'Tuần', exact: true }).click();
  await p.locator('input[type="date"]').first().fill('2026-11-03');
  const row = p.locator('.task-card').filter({
    has: p.locator('.task-repeat-badge', { hasText: '2026-11-06' }),
  });
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await p
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-11-06T15:00');
  await p.getByLabel('Giờ kết thúc Task lặp', { exact: true }).fill('16:00');
  await p.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect
    .poll(
      async () => {
        const b = await local(q, user);
        return new Date(b[1].start).getHours();
      },
      { timeout: 15000 },
    )
    .toBe(15);
  let b = await local(q, user);
  expect(b).toHaveLength(4);
  expect(b[0]).toEqual(original[0]);
  expect(b[2]).toEqual(original[2]);
  await row.getByRole('button', { name: 'Xóa', exact: true }).click();
  await p
    .getByRole('group', { name: 'Xác nhận xóa Task' })
    .getByRole('button', { name: 'Xác nhận xóa', exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const b = await local(q, user);
        return b.find((b: { id: string }) => b.id === original[1].id)
          ?.cancelled;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await q.reload();
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  b = await local(q, user);
  expect(b.filter((b: { cancelled?: boolean }) => !b.cancelled)).toHaveLength(
    3,
  );
  server = (await a.rpc('lbd_read_workspace')).data;
  expect(
    server.payload.planner.blocks.filter(
      (b: { cancelled?: boolean }) => !b.cancelled,
    ),
  ).toHaveLength(3);
  expect(server.payload.timer.snapshot.history).toEqual([]);
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
});
