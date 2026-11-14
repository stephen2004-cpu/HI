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
  await p
    .getByRole('group', { name: 'Phạm vi lưu Task lặp' })
    .getByRole('button', { name: 'Chỉ lần này', exact: true })
    .click();
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
    .getByRole('button', { name: 'Chỉ lần này', exact: true })
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

test('one-off save atomically syncs Eisenhower and Calendar across desktop/mobile, preserves a manual Calendar edit and reloads without duplicates', async ({
  browser,
}) => {
  const a = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `one-off-${randomUUID()}@example.com`,
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
  await p.getByLabel('Tên công việc', { exact: true }).fill('Học VNR một lần');
  await p
    .getByRole('combobox', { name: 'Nhóm ưu tiên', exact: true })
    .selectOption('do');
  await p.getByLabel('Phút mỗi phiên Focus', { exact: true }).fill('60');
  await p
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-10-31T09:00');
  await p.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await a.rpc('lbd_read_workspace')).data?.payload?.planner.blocks
          .length,
      { timeout: 15000 },
    )
    .toBe(1);
  const server = (await a.rpc('lbd_read_workspace')).data.payload;
  expect(server.tasks.tasks).toHaveLength(1);
  expect(server.tasks.tasks[0].group).toBe('do');
  expect(server.planner.blocks[0].taskId).toBe(server.tasks.tasks[0].id);
  await login(q, email, password, user);
  await expect.poll(() => local(q, user)).toEqual(server.planner.blocks);
  await expect(
    q
      .getByRole('region', { name: 'Làm ngay', exact: true })
      .getByRole('checkbox', { name: 'Học VNR một lần', exact: true }),
  ).toBeVisible();
  await q.getByRole('button', { name: 'Sửa', exact: true }).click();
  await q
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-10-31T11:00');
  await q.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect
    .poll(async () => new Date((await local(p, user))[0].start).getHours(), {
      timeout: 15000,
    })
    .toBe(11);
  await q.goto('/#Lịch');
  await q
    .getByRole('button', { name: 'Sửa lịch Học VNR một lần', exact: true })
    .click();
  const dialog = q.getByRole('dialog');
  await dialog.getByLabel('Bắt đầu', { exact: true }).fill('2026-10-31T13:00');
  await dialog.getByLabel('Kết thúc', { exact: true }).fill('2026-10-31T14:30');
  await dialog
    .getByRole('button', { name: 'Lưu Time Block', exact: true })
    .click();
  await expect
    .poll(async () => new Date((await local(p, user))[0].start).getHours(), {
      timeout: 15000,
    })
    .toBe(13);
  const manual = await local(p, user);
  expect(manual[0].taskOverride).toBe(true);
  await p.goto('/#Task');
  await p.getByRole('button', { name: 'Sửa', exact: true }).click();
  await p
    .getByLabel('Tên công việc', { exact: true })
    .fill('Đổi tên, giữ lịch chỉnh tay');
  await p.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  expect(await local(p, user)).toEqual(manual);
  await p.reload();
  await q.reload();
  await expect.poll(() => local(q, user)).toEqual(manual);
  await expect.poll(() => local(p, user)).toEqual(manual);
  const final = (await a.rpc('lbd_read_workspace')).data.payload;
  expect(final.tasks.tasks).toHaveLength(1);
  expect(final.tasks.tasks[0].title).toBe('Đổi tên, giữ lịch chỉnh tay');
  expect(final.planner.blocks).toHaveLength(1);
  expect(final.planner.blocks).toEqual(manual);
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
});
