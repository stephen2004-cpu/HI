import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { emptyWorkspace } from '../src/workspace';
import { SYNC_READ_TIMEOUT_MS } from '../src/sync';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
async function fixture() {
  const a = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `startup-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  const signup = await a.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const w = emptyWorkspace();
  w.tasks.tasks = [
    {
      id: 'keep',
      title: 'Giữ công việc cũ',
      notes: 'Dữ liệu gốc',
      group: 'do',
      color: '',
      completed: false,
    },
  ];
  expect(
    (await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload: w }))
      .error,
  ).toBeNull();
  return { a, email, password, user: signup.data.user!.id, w };
}
async function login(p: Page, email: string, password: string) {
  await p.goto('/?auth=login#Task');
  await p.getByLabel('Email', { exact: true }).fill(email);
  await p.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await p
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
}
for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile startup' : 'desktop startup', () => {
    test.use(
      mobile
        ? {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          }
        : { viewport: { width: 1440, height: 1000 } },
    );
    test('manual sync finishes with unchanged server data and recovers from a temporary API failure', async ({
      page,
    }) => {
      const { a, email, password, user } = await fixture();
      await login(page, email, password);
      await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
        timeout: 15000,
      });
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      let unavailable = false;
      let reads = 0;
      let writes = 0;
      await page.route('**/rest/v1/rpc/lbd_commit_workspace', (route) => {
        writes++;
        return route.continue();
      });
      await page.route('**/rest/v1/rpc/lbd_read_workspace', (route) => {
        reads++;
        return unavailable
          ? route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({
                code: 'PGRST002',
                details: null,
                hint: null,
                message:
                  'Could not query the database for the schema cache. Retrying.',
              }),
            })
          : route.continue();
      });
      const before = (await a.rpc('lbd_read_workspace')).data;
      const retry = page.getByRole('button', {
        name: 'Đồng bộ ngay',
        exact: true,
      });
      await retry.click();
      await expect.poll(() => reads).toBe(1);
      await expect(page.locator('.sync-status')).toHaveClass(/synced/);
      await expect(retry).toBeEnabled();
      unavailable = true;
      await retry.click();
      await expect(page.locator('.sync-status')).toHaveClass(/error/);
      unavailable = false;
      await retry.click();
      await expect(page.locator('.sync-status')).toHaveClass(/synced/);
      await expect(retry).toBeEnabled();
      expect(reads).toBe(3);
      expect(writes).toBe(0);
      expect((await a.rpc('lbd_read_workspace')).data).toEqual(before);
      expect(
        await page.evaluate(
          (id) => JSON.parse(localStorage.getItem(`lbd-account:${id}:sync`)!),
          user,
        ),
      ).toEqual({ revision: before.revision, dirty: false });
      await expect(
        page.getByRole('checkbox', { name: 'Giữ công việc cũ', exact: true }),
      ).toBeVisible();
      await a.auth.signOut();
    });
    test('a stalled first RPC shows an actionable timeout, keeps the account locked and recovers by retry', async ({
      page,
    }) => {
      const { a, email, password, user, w } = await fixture();
      await page.clock.install();
      let blocked = true;
      await page.route('**/rest/v1/rpc/lbd_read_workspace', (route) => {
        if (!blocked) return route.continue();
      });
      const request = page.waitForRequest('**/rest/v1/rpc/lbd_read_workspace');
      await login(page, email, password);
      await request;
      await page.clock.fastForward(SYNC_READ_TIMEOUT_MS + 10);
      const panel = page.getByRole('region', {
        name: 'Mở dữ liệu tài khoản',
        exact: true,
      });
      await expect(panel.getByRole('alert')).toContainText('phản hồi quá lâu');
      await expect(
        page.getByLabel('Tên công việc', { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: 'Xác nhận nhập dữ liệu khách',
          exact: true,
        }),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          (user) =>
            localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-timer`),
          user,
        ),
      ).toBeNull();
      expect((await a.rpc('lbd_read_workspace')).data.payload.tasks).toEqual(
        w.tasks,
      );
      await page
        .getByRole('button', { name: 'Đóng tài khoản', exact: true })
        .click();
      await expect(panel.getByRole('alert')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/lbd-sync-timeout-${mobile ? 'mobile' : 'desktop'}.png`,
        fullPage: true,
      });
      blocked = false;
      await panel
        .getByRole('button', { name: 'Thử tải lại dữ liệu', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: 'Task & Ma trận Eisenhower',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('.sync-status')).toHaveClass(/synced/);
      await expect(
        page.getByRole('checkbox', { name: 'Giữ công việc cũ', exact: true }),
      ).toBeVisible();
      await a.auth.signOut();
    });
    test('a complete cache opens during a stalled read and protects changes made before a newer server response', async ({
      page,
    }) => {
      const { a, email, password, user, w } = await fixture();
      await login(page, email, password);
      await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
        timeout: 15000,
      });
      await expect(
        page.getByRole('heading', {
          name: 'Task & Ma trận Eisenhower',
          exact: true,
        }),
      ).toBeVisible();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/rest/v1/rpc/lbd_read_workspace', async (route) => {
        await gate;
        try {
          await route.continue();
        } catch {
          /* An aborted old request cannot apply a snapshot. */
        }
      });
      const read = page.waitForRequest('**/rest/v1/rpc/lbd_read_workspace');
      await page.reload();
      await read;
      // This succeeds before the network request is released; no fake empty account is created.
      await expect(
        page.getByLabel('Tên công việc', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.sync-status')).toContainText(
        'dữ liệu đã lưu',
      );
      await page
        .getByLabel('Tên công việc', { exact: true })
        .fill('Tạo khi mạng đang chậm');
      await page
        .getByRole('button', { name: 'Thêm Task', exact: true })
        .click();
      await expect(
        page.getByRole('checkbox', {
          name: 'Tạo khi mạng đang chậm',
          exact: true,
        }),
      ).toBeVisible();
      const remote = await a.rpc('lbd_read_workspace');
      const newer = structuredClone(remote.data.payload);
      newer.tasks.tasks.push({
        ...w.tasks.tasks[0],
        id: 'server-only',
        title: 'Task từ thiết bị khác',
      });
      expect(
        (
          await a.rpc('lbd_commit_workspace', {
            expected_revision: remote.data.revision,
            payload: newer,
          })
        ).error,
      ).toBeNull();
      release();
      await expect(page.locator('.sync-status')).toHaveClass(/conflict/, {
        timeout: 15000,
      });
      await expect(
        page.getByRole('checkbox', {
          name: 'Tạo khi mạng đang chậm',
          exact: true,
        }),
      ).toBeVisible();
      const local = await page.evaluate(
        (user) =>
          JSON.parse(
            localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
          ).tasks,
        user,
      );
      expect(
        local.some(
          (t: { title: string }) => t.title === 'Tạo khi mạng đang chậm',
        ),
      ).toBe(true);
      expect(
        (await a.rpc('lbd_read_workspace')).data.payload.tasks.tasks,
      ).toEqual(newer.tasks.tasks);
      await a.auth.signOut();
    });
  });
}
