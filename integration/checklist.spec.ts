import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { emptyWorkspace } from '../src/workspace';
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
  const email = `checklist-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  const signup = await a.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const w = emptyWorkspace();
  w.tasks.tasks = [
    {
      id: 'task-docs',
      title: 'Checklist đồng bộ',
      notes: 'Keep notes',
      group: 'do',
      color: '',
      completed: false,
      checklist: [
        { id: 'step-a', text: 'Bước A', done: true },
        { id: 'step-b', text: 'Bước B', done: false },
        { id: 'step-c', text: 'Bước C', done: false },
      ],
    },
    {
      id: 'old-task',
      title: 'Task cũ không đổi',
      notes: 'Keep legacy Task',
      group: 'schedule',
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
async function login(page: Page, email: string, password: string) {
  await page.goto('/?auth=login#Task');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.locator('.task-card').filter({ hasText: 'Checklist đồng bộ' }),
  ).toBeVisible();
  await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
}
async function edit(page: Page) {
  await page
    .locator('.task-card')
    .filter({ hasText: 'Checklist đồng bộ' })
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
}
async function documentValue(page: Page, user: string) {
  return page.evaluate(
    (user) =>
      JSON.parse(
        localStorage.getItem(`lbd-account:${user}:lbd-focus-v2-tasks`)!,
      ).tasks.find((t: { id: string }) => t.id === 'task-docs'),
    user,
  );
}

test('step documents and ordered complete steps sync between independent desktop/mobile sessions, reload and preserve legacy Task and guest data', async ({
  browser,
}) => {
  const { a, email, password, user, w } = await fixture();
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
  await p.evaluate(() =>
    localStorage.setItem('lbd-focus-v1', 'legacy-unchanged'),
  );
  await edit(p);
  const step = p.locator('.checklist-step').first();
  await step.locator('summary').click();
  await step
    .getByLabel('Tên tài liệu', { exact: true })
    .fill('Tài liệu đồng bộ');
  await step
    .getByLabel('Link làm việc', { exact: true })
    .fill('https://www.figma.com/file/example');
  await step
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await expect
    .poll(
      async () =>
        (await documentValue(q, user)).checklist[0].documents?.[0]?.name,
      { timeout: 15000 },
    )
    .toBe('Tài liệu đồng bộ');
  await edit(q);
  const handle = q.getByRole('button', {
    name: 'Kéo sắp xếp bước 1',
    exact: true,
  });
  await handle.focus();
  await q.keyboard.press('Alt+ArrowDown');
  await expect(q.getByLabel('Nội dung bước 2', { exact: true })).toHaveValue(
    'Bước A',
  );
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await expect
    .poll(
      async () =>
        (await documentValue(p, user)).checklist.map(
          (s: { id: string }) => s.id,
        ),
      { timeout: 15000 },
    )
    .toEqual(['step-b', 'step-a', 'step-c']);
  const final = (await a.rpc('lbd_read_workspace')).data.payload;
  expect(
    final.tasks.tasks.find((t: { id: string }) => t.id === 'task-docs')
      .checklist[1],
  ).toEqual({
    ...w.tasks.tasks[0].checklist![0],
    documents: [
      expect.objectContaining({
        name: 'Tài liệu đồng bộ',
        url: 'https://www.figma.com/file/example',
      }),
    ],
  });
  expect(
    final.tasks.tasks.find((t: { id: string }) => t.id === 'old-task'),
  ).toEqual(w.tasks.tasks[1]);
  expect(final.timer).toEqual(w.timer);
  expect(final.habits).toEqual(w.habits);
  expect(final.planner).toEqual(w.planner);
  await p.reload();
  await edit(p);
  await expect(
    p.getByLabel('Hoàn thành bước 2', { exact: true }),
  ).toBeChecked();
  await p.locator('.checklist-step').nth(1).locator('summary').click();
  await expect(
    p.getByRole('article', { name: 'Tài liệu Tài liệu đồng bộ', exact: true }),
  ).toBeVisible();
  expect(await p.evaluate(() => localStorage.getItem('lbd-focus-v1'))).toBe(
    'legacy-unchanged',
  );
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
});

test('file UI refuses missing Storage, then exercises mocked upload/view/download and stores only metadata through real Task sync', async ({
  page,
  context,
}) => {
  const { a, email, password, user } = await fixture();
  await login(page, email, password);
  await edit(page);
  const step = page.locator('.checklist-step').first();
  await step.locator('summary').click();
  const before = await documentValue(page, user);
  const file = {
    name: 'reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('File bytes only in Storage, never LocalStorage'),
  };
  await step.getByLabel('Đính kèm file').setInputFiles(file);
  await step
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(step.getByRole('alert')).toContainText('Cần bucket private');
  expect(await documentValue(page, user)).toEqual(before);
  let uploadedPath = '';
  await context.route(
    '**/storage/v1/object/lbd-checklist-files/**',
    async (route) => {
      expect(route.request().method()).toBe('POST');
      uploadedPath = new URL(route.request().url()).pathname.split(
        '/lbd-checklist-files/',
      )[1];
      expect(uploadedPath.startsWith(`${user}/`)).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Key: `lbd-checklist-files/${uploadedPath}` }),
      });
    },
  );
  await step
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(
    step.getByRole('article', { name: 'Tài liệu reference.txt', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  const saved = await documentValue(page, user);
  expect(saved.checklist[0].documents[0].file).toEqual({
    bucket: 'lbd-checklist-files',
    path: uploadedPath,
    name: 'reference.txt',
    size: file.buffer.length,
    mime: 'text/plain',
  });
  expect(JSON.stringify(saved)).not.toContain(file.buffer.toString());
  expect(JSON.stringify(saved)).not.toContain('signedUrl');
  await context.route(
    '**/storage/v1/object/sign/lbd-checklist-files/**',
    async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ expiresIn: 60 });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            signedURL: `/object/sign/lbd-checklist-files/${uploadedPath}?token=local-test-only`,
          }),
        });
      } else
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: file.buffer,
        });
    },
  );
  const popup = page.waitForEvent('popup');
  await step.getByRole('button', { name: 'Xem file', exact: true }).click();
  const view = await popup;
  await expect(view.locator('body')).toContainText(file.buffer.toString());
  await view.close();
  const downloadPopup = page.waitForEvent('popup');
  await step.getByRole('button', { name: 'Tải file', exact: true }).click();
  const download = await downloadPopup;
  await expect(download).toHaveURL(/download=reference.txt/);
  await download.close();
  await step
    .getByRole('button', { name: 'Xóa tài liệu reference.txt', exact: true })
    .click();
  expect((await documentValue(page, user)).checklist[0].documents).toEqual([]);
  await a.auth.signOut();
});
