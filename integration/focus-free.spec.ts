import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { emptyWorkspace } from '../src/workspace';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
async function login(page: Page, email: string, password: string) {
  await page.clock.install({ time: new Date(2026, 10, 6, 9) });
  await page.goto('/?auth=login#Focus');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(page.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
}
test('leaving Task Focus syncs measured history, unfinished reminders and the free selection to another device without changing Calendar/Habits', async ({
  browser,
}) => {
  const a = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `focus-free-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  expect((await a.auth.signUp({ email, password })).error).toBeNull();
  const w = emptyWorkspace();
  w.tasks.tasks = [
    {
      id: 'project',
      title: 'Đồ án đồng bộ',
      notes: 'Giữ Notes',
      group: 'do',
      color: '',
      completed: false,
      timing: {
        mode: 'study',
        focusMinutes: 1,
        focusCount: 2,
        breakMinutes: 0.25,
      },
      checklist: [
        {
          id: 's',
          text: 'Giữ bước cũ',
          done: true,
          documents: [
            { id: 'd', name: 'Tài liệu', url: 'https://example.com' },
          ],
        },
      ],
    },
  ];
  const start = +new Date(2026, 10, 6, 9);
  w.planner.blocks = [
    {
      id: 'block',
      taskId: 'project',
      title: 'Đồ án đồng bộ',
      start,
      end: start + 120000,
      color: '',
    },
  ];
  w.habits.habits = [
    {
      id: 'keep-habit',
      name: 'Giữ Habit',
      category: 'Cá nhân',
      days: [1, 3, 5],
      weeklyTarget: 3,
      minutes: 25,
      archived: false,
      logs: { '2026-11-04': 'done' },
    },
  ];
  expect(
    (await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload: w }))
      .error,
  ).toBeNull();
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const p = await desktop.newPage(),
      q = await phone.newPage();
    await login(p, email, password);
    await p.goto('/#Lịch');
    await p
      .getByRole('button', { name: 'Time Block Đồ án đồng bộ', exact: true })
      .press('Enter');
    await p
      .getByRole('button', { name: 'Bắt đầu chuỗi học', exact: true })
      .click();
    await p.clock.fastForward(20000);
    await p
      .getByRole('button', { name: 'Về Focus tự do', exact: true })
      .click();
    // Let the ordinary debounced workspace writer run, without changing its sync implementation.
    await p.clock.runFor(2000);
    await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
      timeout: 15000,
    });
    const remote = (await a.rpc('lbd_read_workspace')).data.payload;
    expect(remote.tasks.tasks[0]).toEqual({
      ...w.tasks.tasks[0],
      status: 'doing',
    });
    expect(remote.timer.snapshot.run).toBeNull();
    expect(remote.timer.snapshot.history).toHaveLength(1);
    expect(remote.timer.snapshot.history[0]).toMatchObject({
      taskId: 'project',
      blockId: 'block',
      status: 'stopped',
    });
    expect(
      remote.timer.snapshot.history[0].actualSeconds,
    ).toBeGreaterThanOrEqual(20);
    expect(remote.timer.snapshot.history[0].actualSeconds).toBeLessThan(23);
    expect(remote.timer.settings.focusSelection).toEqual({ taskId: '' });
    expect(remote.planner).toEqual(w.planner);
    expect(remote.habits).toEqual(w.habits);
    await login(q, email, password);
    await expect(
      q.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
    ).toHaveValue('');
    await expect(
      q.getByRole('button', { name: 'Quay lại Đồ án đồng bộ', exact: true }),
    ).toBeVisible();
    await q.reload();
    await expect(
      q.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
    ).toHaveValue('');
    await q
      .getByRole('button', { name: 'Quay lại Đồ án đồng bộ', exact: true })
      .click();
    await expect(
      q.getByRole('heading', { name: 'Đồ án đồng bộ', exact: true }),
    ).toBeVisible();
    await expect(
      q.getByLabel('Hoàn thành bước 1', { exact: true }),
    ).toBeChecked();
    await q.clock.runFor(2000);
    await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
      timeout: 15000,
    });
    const resumed = (await a.rpc('lbd_read_workspace')).data.payload;
    expect(resumed.timer.snapshot.history).toEqual(
      remote.timer.snapshot.history,
    );
    expect(resumed.tasks.tasks).toEqual(remote.tasks.tasks);
    expect(resumed.timer.snapshot.run).toBeNull();
    expect(resumed.timer.settings.focusSelection).toEqual({
      taskId: 'project',
      blockId: 'block',
    });
  } finally {
    await desktop.close();
    await phone.close();
    await a.auth.signOut();
  }
});
