import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
async function login(p: Page, email: string, password: string, user: string) {
  await p.clock.setSystemTime(new Date(2026, 10, 6, 8));
  await p.goto('/?auth=login');
  await p.getByLabel('Email', { exact: true }).fill(email);
  await p.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await p
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect
    .poll(
      () =>
        p.evaluate(
          (u) =>
            localStorage.getItem(`lbd-account:${u}:lbd-focus-v2-planner`) !==
            null,
          user,
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
}
test('Calendar drag uses shared Task sync and persists the same Task/block on a second device and after reload', async ({
  browser,
}) => {
  const a = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `calendar-drag-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  const signed = await a.auth.signUp({ email, password });
  expect(signed.error).toBeNull();
  const user = signed.data.user!.id;
  const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    p = await desktop.newPage(),
    q = await phone.newPage();
  await login(p, email, password, user);
  const c = p.getByLabel('Lịch 06/11', { exact: true });
  await c.evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'center' });
    const scroller = el.closest('.calendar-scroll')!;
    scroller.scrollTop = 480;
    window.scrollTo(
      0,
      window.scrollY + scroller.getBoundingClientRect().top - 80,
    );
  });
  const b = (await c.boundingBox())!;
  await p.mouse.move(b.x + b.width / 2, b.y + 540);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2, b.y + 630, { steps: 10 });
  await expect(p.getByLabel('Khoảng thời gian đang chọn')).toContainText(
    '09:00–10:30',
  );
  await p.mouse.up();
  const d = p.getByRole('dialog', { name: 'Tạo Task từ Calendar' });
  await d
    .getByLabel('Tên công việc', { exact: true })
    .fill('Đồng bộ từ vùng chọn');
  await d.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await a.rpc('lbd_read_workspace')).data?.payload?.planner.blocks
          .length,
      { timeout: 15000 },
    )
    .toBe(1);
  const w = (await a.rpc('lbd_read_workspace')).data.payload;
  expect(w.tasks.tasks).toHaveLength(1);
  expect(w.planner.blocks[0].taskId).toBe(w.tasks.tasks[0].id);
  expect(w.planner.blocks[0].end - w.planner.blocks[0].start).toBe(90 * 60000);
  await login(q, email, password, user);
  await expect(
    q.getByRole('button', {
      name: 'Time Block Đồng bộ từ vùng chọn',
      exact: true,
    }),
  ).toHaveCount(1);
  await q.reload();
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  expect(
    await q.evaluate(
      (u) =>
        JSON.parse(
          localStorage.getItem(`lbd-account:${u}:lbd-focus-v2-planner`)!,
        ).blocks,
      user,
    ),
  ).toEqual(w.planner.blocks);
  await q.goto('/#Task');
  await expect(
    q.getByRole('checkbox', { name: 'Đồng bộ từ vùng chọn', exact: true }),
  ).toBeVisible();
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
});
