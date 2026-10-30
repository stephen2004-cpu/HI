import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { emptyWorkspace } from '../src/workspace';
import { localDate, setHabitSchedule } from '../src/habits';
import { addDays } from '../src/planner';
import { taskRange } from '../src/taskPeriods';
import { begin, record } from '../src/engine';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
async function login(page: Page, email: string, password: string) {
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
}
test('date-scoped habitual tasks sync between desktop/mobile without duplicates, history loss or recreation after deleting an occurrence', async ({
  browser,
}) => {
  const a = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    email = `period-${randomUUID()}@example.com`,
    password = `Lbd-${randomUUID()}!`;
  expect((await a.auth.signUp({ email, password })).error === null).toBe(true);
  const w = emptyWorkspace(),
    today = localDate(new Date()),
    yesterday = localDate(addDays(new Date(), -1));
  w.habits.habits = [
    setHabitSchedule(
      {
        id: 'weekly',
        name: 'Habit đồng bộ',
        category: 'Cá nhân',
        days: [0, 1, 2, 3, 4, 5, 6],
        weeklyTarget: 7,
        minutes: 25,
        archived: false,
        logs: { [yesterday]: 'done' },
      },
      today,
      '09:00',
    ),
  ];
  w.tasks.tasks = [
    {
      id: 'original',
      title: 'Task gốc không đổi',
      notes: 'Giữ nguyên',
      group: 'do',
      color: '',
      completed: false,
    },
  ];
  const run = begin(
    'timer',
    [
      {
        id: 's',
        kind: 'study',
        name: 'History gốc',
        seconds: 60,
        sound: 'bell',
      },
    ],
    false,
    Date.now() - 120000,
  );
  w.timer.snapshot.history = [record(run, Date.now() - 60000, 'completed')];
  expect(
    (await a.rpc('lbd_commit_workspace', { expected_revision: 0, payload: w }))
      .error === null,
  ).toBe(true);
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
  await expect(p.locator('.eisenhower-grid .task-card')).toHaveCount(1);
  const tabs = (page: Page) =>
    page.getByRole('group', { name: 'Khoảng thời gian Task', exact: true });
  await tabs(p).getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await tabs(q).getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  const { to } = taskRange(today, 'week');
  let count = 0;
  for (let d = new Date(`${today}T00:00:00`); +d < +to; d = addDays(d, 1))
    count++;
  await expect(q.locator('.eisenhower-grid .task-card')).toHaveCount(count);
  const current = await a.rpc('lbd_read_workspace');
  const ids = current.data.payload.tasks.tasks.map((t: { id: string }) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toHaveLength(count + 1);
  const currentCard = p
    .locator('.eisenhower-grid .task-card')
    .filter({ hasText: today });
  await expect(currentCard).toHaveCount(1);
  await currentCard.getByRole('button', { name: 'Xóa', exact: true }).click();
  await currentCard
    .getByRole('button', { name: 'Xác nhận xóa', exact: true })
    .click();
  await expect(p.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  await expect
    .poll(
      async () => {
        const raw = await q.evaluate(() =>
          localStorage.getItem(
            'lbd-account:' +
              JSON.parse(localStorage.getItem('lbd-supabase-auth')!).user.id +
              ':lbd-focus-v2-tasks',
          ),
        );
        return (
          !!raw &&
          !JSON.parse(raw).tasks.some(
            (t: { id: string }) => t.id === `habit:weekly:${today}`,
          )
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await tabs(q).getByRole('button', { name: 'Tháng', exact: true }).click();
  await tabs(q).getByRole('button', { name: 'Ngày', exact: true }).click();
  await expect(q.locator('.eisenhower-grid .task-card')).toHaveCount(0);
  await q.reload();
  await expect(q.locator('.eisenhower-grid .task-card')).toHaveCount(0);
  await expect(q.locator('.sync-status')).toHaveClass(/synced/, {
    timeout: 15000,
  });
  const final = await a.rpc('lbd_read_workspace');
  expect(
    final.data.payload.tasks.tasks.some(
      (t: { id: string }) => t.id === `habit:weekly:${today}`,
    ),
  ).toBe(false);
  expect(
    final.data.payload.tasks.tasks.find(
      (t: { id: string }) => t.id === 'original',
    ),
  ).toEqual(w.tasks.tasks[0]);
  expect(final.data.payload.habits.habits).toEqual(w.habits.habits);
  expect(final.data.payload.timer.snapshot.history).toEqual(
    w.timer.snapshot.history,
  );
  const finalIds = final.data.payload.tasks.tasks.map(
    (t: { id: string }) => t.id,
  );
  expect(new Set(finalIds).size).toBe(finalIds.length);
  await desktop.close();
  await phone.close();
  await a.auth.signOut();
});
