import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { seriesFixture } from '../e2e/task-series-fixture';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
const card = (p: Page, date: string) =>
  p
    .locator('.task-card')
    .filter({ has: p.locator('.task-repeat-badge', { hasText: date }) });
async function login(p: Page, email: string, password: string) {
  await p.clock.setSystemTime(new Date(2026, 10, 14, 6));
  await p.goto('/?auth=login#Task');
  await p.getByLabel('Email', { exact: true }).fill(email);
  await p.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await p
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await p.getByRole('button', { name: 'Tháng', exact: true }).click();
  await expect(p.locator('.task-repeat-badge')).toHaveCount(5);
}
const local = (p: Page, user: string) =>
  p.evaluate(
    (user) =>
      JSON.parse(
        localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
      ).tasks,
    user,
  );
test('desktop/mobile share series edits; capability gate refuses mutation; series deletion wins over offline stale edits and fresh legacy writes', async ({
  browser,
}) => {
  const api = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `series-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  const signup = await api.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const user = signup.data.user!.id;
  const { workspace, root } = seriesFixture();
  expect(
    (
      await api.rpc('lbd_commit_workspace', {
        expected_revision: 0,
        payload: workspace,
      })
    ).error,
  ).toBeNull();
  const desktop = await browser.newContext(),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  desktop.setDefaultTimeout(10000);
  phone.setDefaultTimeout(10000);
  try {
    const p = await desktop.newPage(),
      q = await phone.newPage();
    await login(p, email, password);
    await login(q, email, password);
    await card(p, '2026-11-14')
      .getByRole('button', { name: 'Sửa', exact: true })
      .click();
    await p.getByLabel('Màu riêng', { exact: true }).fill('#123456');
    await p.getByRole('button', { name: 'Lưu Task', exact: true }).click();
    await p
      .getByRole('group', { name: 'Phạm vi lưu Task lặp' })
      .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await local(q, user))
            .filter((t: any) => t.repeatSeriesId)
            .every((t: any) => t.color === '#123456'),
        { timeout: 15000 },
      )
      .toBe(true);
    const completed = (await local(q, user)).find(
      (t: any) => t.repeatDate === '2026-11-15',
    );
    expect(completed).toMatchObject({
      completed: true,
      notes: 'Ghi chú riêng',
      checklist: [{ id: 'step', text: 'Chuẩn bị', done: true }],
    });
    await card(p, '2026-11-14')
      .getByRole('button', { name: 'Xóa', exact: true })
      .click();
    const choice = p.getByRole('group', { name: 'Xác nhận xóa Task' });
    await p.route('**/rest/v1/rpc/lbd_task_series_deletion_capabilities', (r) =>
      r.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST202',
          message: 'test missing capability',
        }),
      }),
    );
    const before = await local(p, user);
    await choice
      .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
      .click();
    await expect(choice.getByRole('alert')).toContainText('chưa được bật');
    expect(await local(p, user)).toEqual(before);
    await p.unroute('**/rest/v1/rpc/lbd_task_series_deletion_capabilities');
    await q.getByRole('button', { name: 'Tháng', exact: true }).click();
    await expect(card(q, '2026-11-16')).toBeVisible();
    await phone.setOffline(true);
    await card(q, '2026-11-16')
      .getByRole('button', { name: 'Sửa', exact: true })
      .click();
    await q
      .locator('.task-form textarea')
      .first()
      .fill('Chỉnh riêng lúc offline');
    await q.getByRole('button', { name: 'Lưu Task', exact: true }).click();
    await q
      .getByRole('group', { name: 'Phạm vi lưu Task lặp' })
      .getByRole('button', { name: 'Chỉ lần này', exact: true })
      .click();
    await choice
      .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
      .click();
    await expect(p.locator('.task-repeat-badge')).toHaveCount(0);
    await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
      timeout: 15000,
    });
    await phone.setOffline(false);
    await expect
      .poll(
        async () =>
          (await local(q, user)).find((t: any) => t.id === root.id)?.deletedAt >
          0,
        { timeout: 20000 },
      )
      .toBe(true);
    await expect(q.locator('.task-repeat-badge')).toHaveCount(0);
    await expect(q.locator('.sync-status')).toHaveClass(
      /synced|conflict|remote-waiting/,
      { timeout: 15000 },
    );
    if (
      !(await q.locator('.sync-status').getAttribute('class'))?.includes(
        'synced',
      )
    ) {
      if (
        !(await q
          .getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true })
          .isVisible())
      )
        await q
          .getByRole('button', { name: 'Tài khoản & đồng bộ', exact: true })
          .click();
      q.once('dialog', (dialog) => dialog.accept());
      await q
        .getByRole('button', { name: 'Dùng bản thiết bị này', exact: true })
        .click();
    }
    await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
      timeout: 15000,
    });
    const server = (await api.rpc('lbd_read_workspace')).data;
    expect(server.payload.timer).toEqual(workspace.timer);
    expect(server.payload.planner.blocks.every((b: any) => b.cancelled)).toBe(
      true,
    );
    expect(
      server.payload.tasks.tasks.find((t: any) => t.id === 'independent'),
    ).toEqual(workspace.tasks.tasks.find((t) => t.id === 'independent'));
    // A peer that read the newest revision can still carry a stale pre-delete payload.
    const stale = structuredClone(workspace);
    const future = {
      ...workspace.tasks.tasks.find((t) => t.repeatDate === '2026-11-16')!,
      id: 'legacy-unseen',
      repeatDate: '2030-01-01',
      plannedStart: '2030-01-01T07:30',
    };
    stale.tasks.tasks.push(future);
    stale.planner.blocks.push({
      id: 'legacy-block',
      taskId: future.id,
      recurringTaskId: root.id,
      title: future.title,
      color: '',
      start: +new Date(2030, 0, 1, 7, 30),
      end: +new Date(2030, 0, 1, 8),
    });
    expect(
      (
        await api.rpc('lbd_commit_workspace', {
          expected_revision: server.revision,
          payload: stale,
        })
      ).error,
    ).toBeNull();
    const protectedRemote = (await api.rpc('lbd_read_workspace')).data.payload;
    expect(
      protectedRemote.tasks.tasks
        .filter((t: any) => t.repeatSeriesId === root.id || t.id === root.id)
        .every((t: any) => t.deletedAt > 0),
    ).toBe(true);
    expect(
      protectedRemote.planner.blocks.find((b: any) => b.id === 'legacy-block')
        .cancelled,
    ).toBe(true);
    await p.reload();
    await q.reload();
    await expect(p.locator('.task-repeat-badge')).toHaveCount(0);
    await expect(q.locator('.task-repeat-badge')).toHaveCount(0);
    await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
      timeout: 15000,
    });
    await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
      timeout: 15000,
    });
    expect((await api.rpc('lbd_read_workspace')).data.payload.timer).toEqual(
      workspace.timer,
    );
  } finally {
    await desktop.close();
    await phone.close();
    await api.auth.signOut();
  }
});
