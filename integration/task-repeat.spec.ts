import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { emptyWorkspace } from '../src/workspace';
import { createTaskRepeat, generateTaskRange } from '../src/taskRecurrence';
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
async function login(page: Page, email: string, password: string) {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
  await page.goto('/?auth=login#Task');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Task & Ma trận Eisenhower',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await expect(page.locator('.task-repeat-badge')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
}
const card = (page: Page, date: string) =>
  page
    .locator('.task-card')
    .filter({ has: page.locator('.task-repeat-badge', { hasText: date }) });
test('series sync two devices; missing deletion RPC refuses safely; tombstones survive stale/offline peers, omitted rows, reload and fresh-revision legacy writes', async ({
  browser,
}) => {
  const a = client(),
    email = `task-repeat-${randomUUID()}@example.com`,
    pass = `Lbd-${randomUUID()}!`;
  const signup = await a.auth.signUp({ email, password: pass });
  expect(signup.error).toBeNull();
  const user = signup.data.user!.id;
  const source = {
    id: 'original',
    title: 'Task lặp đồng bộ',
    notes: 'Ghi chú cũ',
    group: 'do' as const,
    color: '',
    completed: false,
    checklist: [
      {
        id: 's',
        text: 'Bước cũ',
        done: true,
        documents: [
          {
            id: 'd',
            name: 'File cũ',
            file: {
              bucket: 'lbd-checklist-files' as const,
              path: `${user}/${randomUUID()}`,
              name: 'old.pdf',
              size: 12,
              mime: 'application/pdf',
            },
          },
        ],
      },
    ],
  };
  const { root, instance } = createTaskRepeat(source, {
    mode: 'weekly',
    startDate: '2026-10-26',
    days: [1, 3, 5],
    ending: { type: 'count', count: 5 },
  });
  const w = emptyWorkspace();
  w.tasks.tasks = generateTaskRange(
    [root, instance],
    new Date(2026, 9, 26),
    new Date(2026, 10, 2),
    new Set(),
    new Date(2026, 9, 26, 8),
  );
  w.tasks.tasks.push({
    id: 'independent',
    title: 'Task độc lập',
    notes: 'Keep',
    group: 'do',
    color: '',
    completed: false,
  });
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
  await login(p, email, pass);
  await login(q, email, pass);
  await expect(card(p, '2026-10-26')).toHaveCount(1);
  await expect(p.locator('.task-repeat-badge')).toHaveCount(3);
  await card(p, '2026-10-26').getByRole('checkbox').check();
  await p
    .getByRole('heading', { name: 'Task & Ma trận Eisenhower', exact: true })
    .click();
  await expect
    .poll(
      () =>
        q.evaluate(
          (user) =>
            JSON.parse(
              localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
            ).tasks.find((t: { id: string }) => t.id === 'original').completed,
          user,
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await q.getByRole('button', { name: 'Tuần', exact: true }).click();
  await card(q, '2026-10-28')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await q
    .getByLabel('Tên công việc', { exact: true })
    .fill('Chỉnh riêng iPhone');
  await q.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await expect
    .poll(
      () =>
        p.evaluate(
          (user) =>
            JSON.parse(
              localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
            ).tasks.find(
              (t: { repeatDate: string }) => t.repeatDate === '2026-10-28',
            ).title,
          user,
        ),
      { timeout: 15000 },
    )
    .toBe('Chỉnh riêng iPhone');
  await p.getByRole('button', { name: 'Tuần', exact: true }).click();
  await card(p, '2026-10-30')
    .getByRole('button', { name: 'Xóa', exact: true })
    .click();
  await p.route('**/rest/v1/rpc/lbd_task_repeat_capabilities', (r) =>
    r.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PGRST202',
        message: 'missing local test capability',
      }),
    }),
  );
  await p
    .getByRole('group', { name: 'Xác nhận xóa Task' })
    .getByRole('button', { name: 'Xác nhận xóa', exact: true })
    .click();
  await expect(
    p.getByRole('group', { name: 'Xác nhận xóa Task' }).getByRole('alert'),
  ).toContainText('Chưa xóa Task');
  await expect(card(p, '2026-10-30')).toHaveCount(1);
  await p.unroute('**/rest/v1/rpc/lbd_task_repeat_capabilities');
  await phone.setOffline(true);
  await card(q, '2026-10-28')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await q.locator('.task-form textarea').first().fill('Đổi offline');
  await q.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await p
    .getByRole('group', { name: 'Xác nhận xóa Task' })
    .getByRole('button', { name: 'Xác nhận xóa', exact: true })
    .click();
  await expect(card(p, '2026-10-30')).toHaveCount(0);
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await phone.setOffline(false);
  await expect
    .poll(
      () =>
        q.evaluate(
          (user) =>
            JSON.parse(
              localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
            ).tasks.some(
              (t: { repeatDate: string; deletedAt?: number }) =>
                t.repeatDate === '2026-10-30' && !!t.deletedAt,
            ),
          user,
        ),
      { timeout: 15000 },
    )
    .toBe(true);
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
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await p.reload();
  await p.getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(card(p, '2026-10-30')).toHaveCount(0);
  await expect(card(p, '2026-10-26').getByRole('checkbox')).toBeChecked();
  let server = (await a.rpc('lbd_read_workspace')).data;
  const deleted = server.payload.tasks.tasks.find(
    (t: { repeatDate: string }) => t.repeatDate === '2026-10-30',
  );
  expect(deleted.deletedAt).toBeGreaterThan(0);
  expect(server.payload.planner.blocks).toEqual([]);
  expect(server.payload.timer).toEqual(w.timer);
  expect(
    server.payload.tasks.tasks.find((t: { id: string }) => t.id === 'original')
      .checklist,
  ).toEqual(source.checklist);
  expect(
    (
      await a.rpc('lbd_commit_workspace', {
        expected_revision: server.revision,
        payload: w,
      })
    ).error,
  ).toBeNull();
  server = (await a.rpc('lbd_read_workspace')).data;
  expect(
    server.payload.tasks.tasks.find((t: { id: string }) => t.id === deleted.id)
      .deletedAt,
  ).toBe(deleted.deletedAt);
  expect(
    (await a.from('lbd_tasks').delete().eq('id', deleted.id)).error,
  ).toBeNull();
  await q.reload();
  await q.getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(card(q, '2026-10-30')).toHaveCount(0);
  expect(
    await q.evaluate(
      ({ user, id }) =>
        JSON.parse(
          localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
        ).tasks.some(
          (t: { id: string; deletedAt?: number }) =>
            t.id === id && !!t.deletedAt,
        ),
      { user, id: deleted.id },
    ),
  ).toBe(true);
  const other = client();
  await other.auth.signUp({
    email: `task-other-${randomUUID()}@example.com`,
    password: `Lbd-${randomUUID()}!`,
  });
  expect((await other.rpc('lbd_read_task_deletions')).data).toEqual([]);
  expect(
    (await a.from('lbd_task_repeat_deletions').delete().eq('id', deleted.id))
      .error,
  ).not.toBeNull();
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
  await other.auth.signOut();
});
