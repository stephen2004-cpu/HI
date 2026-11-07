import { test, expect, type Page } from '@playwright/test';
import { initial } from '../src/storage';
import type { Task } from '../src/tasks';
const project: Task = {
  id: 'project',
  title: 'Đồ án',
  notes: 'Giữ ghi chú cũ',
  group: 'do',
  color: '#d7b56d',
  completed: false,
  timing: { mode: 'timer', focusMinutes: 1, focusCount: 2, breakMinutes: 0.25 },
  checklist: [
    {
      id: 'one',
      text: 'Bước đã làm',
      done: true,
      documents: [
        { id: 'doc', name: 'Tài liệu cũ', url: 'https://example.com/docs' },
      ],
    },
    { id: 'two', text: 'Bước còn lại', done: false },
  ],
};
async function setup(page: Page, mode: 'timer' | 'study' = 'timer') {
  await page.clock.install({ time: new Date(2026, 10, 6, 9) });
  await page.goto('/#Focus');
  await page.evaluate(
    ({ project, initial, mode }) => {
      localStorage.setItem('lbd-focus-v2-timer', JSON.stringify(initial));
      const start = +new Date(2026, 10, 6, 9);
      localStorage.setItem(
        'lbd-focus-v2-planner',
        JSON.stringify({
          version: 1,
          preferences: { weekStart: 1, blockMinutes: 60 },
          blocks: [
            {
              id: 'block',
              taskId: project.id,
              title: project.title,
              color: '',
              start,
              end: start + 120000,
            },
          ],
        }),
      );
      localStorage.setItem(
        'lbd-focus-v2-tasks',
        JSON.stringify({
          version: 1,
          tasks: [
            { ...project, timing: { ...project.timing, mode } },
            {
              ...project,
              id: 'urgent',
              title: 'Việc gấp',
              checklist: [],
              timing: { ...project.timing, mode: 'timer' },
            },
          ],
        }),
      );
    },
    { project, initial, mode },
  );
  await page.reload();
  await page.goto('/#Lịch');
  await page
    .getByRole('button', { name: 'Time Block Đồ án', exact: true })
    .press('Enter');
}
async function saved(page: Page) {
  return page.evaluate(() => ({
    timer: JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!),
    tasks: JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks,
    planner: localStorage.getItem('lbd-focus-v2-planner'),
    habits: localStorage.getItem('lbd-focus-v2-habits'),
  }));
}
for (const mode of ['timer', 'study'] as const) {
  test(`leave a running ${mode}, preserve actual time/documents, stay free after reload and return to unfinished work`, async ({
    page,
  }) => {
    await setup(page, mode);
    await page
      .getByRole('button', {
        name: mode === 'timer' ? 'Bắt đầu tập trung' : 'Bắt đầu chuỗi học',
        exact: true,
      })
      .click();
    await page.clock.fastForward(30000);
    const before = await saved(page);
    await page
      .getByRole('button', { name: 'Về Focus tự do', exact: true })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
    ).toHaveValue('');
    await expect(page.getByRole('timer')).toHaveAttribute(
      'aria-label',
      '00 giờ 25 phút 00 giây',
    );
    await expect(page.locator('.focus-details')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Task chưa hoàn thành', exact: true }),
    ).toContainText('Đồ án');
    await expect(page.locator('.focus-unfinished')).toContainText(
      '1/2 bước hoàn thành',
    );
    const after = await saved(page);
    expect(after.tasks[0]).toEqual({ ...before.tasks[0], status: 'doing' });
    expect(after.tasks[1]).toEqual(before.tasks[1]);
    expect(after.timer.snapshot.run).toBeNull();
    expect(after.timer.snapshot.history).toHaveLength(1);
    expect(after.timer.snapshot.history[0]).toMatchObject({
      taskId: 'project',
      blockId: 'block',
      status: 'stopped',
    });
    expect(
      after.timer.snapshot.history[0].actualSeconds,
    ).toBeGreaterThanOrEqual(30);
    expect(after.timer.snapshot.history[0].actualSeconds).toBeLessThan(33);
    expect(after.planner).toEqual(before.planner);
    expect(after.habits).toEqual(before.habits);
    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Quay lại Đồ án', exact: true }),
    ).toBeVisible();
    expect((await saved(page)).timer.snapshot.history).toEqual(
      after.timer.snapshot.history,
    );
    await page.screenshot({
      path: `/tmp/lbd-focus-free-${mode}-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Quay lại Đồ án', exact: true })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
    ).toHaveValue('project');
    await expect(
      page.getByLabel('Hoàn thành bước 1', { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByLabel('Hoàn thành bước 2', { exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('tab', { name: 'Chế độ học tập', exact: true }),
    ).toHaveAttribute('aria-selected', String(mode === 'study'));
    await expect(page.locator('.focus-unfinished')).toHaveCount(0);
    expect((await saved(page)).timer.settings.focusSelection.blockId).toBe(
      'block',
    );
    await page
      .getByRole('button', { name: 'Xác nhận Task hoàn thành', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Về Focus tự do', exact: true })
      .click();
    await expect(page.locator('.focus-unfinished')).toHaveCount(0);
    expect((await saved(page)).tasks[0].completed).toBe(true);
  });
}

test('free Focus and an urgent Task do not inherit the deferred Task or its block', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole('combobox', { name: 'Task đang tập trung', exact: true })
    .selectOption('');
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Quay lại Đồ án', exact: true }),
  ).toBeDisabled();
  expect((await saved(page)).timer.snapshot.run.taskId).toBeUndefined();
  await page.clock.fastForward(1500000);
  await page.getByRole('button', { name: 'Tắt chuông', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Task đang tập trung', exact: true })
    .selectOption('urgent');
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await page.clock.fastForward(10000);
  const next = await saved(page);
  expect(next.timer.snapshot.run.taskId).toBe('urgent');
  expect(next.timer.snapshot.run.blockId).toBeUndefined();
  expect(next.tasks[0].completed).toBe(false);
  expect(next.tasks[0].checklist).toEqual(project.checklist);
  expect(
    next.timer.snapshot.history.every(
      (h: { taskId?: string }) => h.taskId === undefined,
    ),
  ).toBe(true);
});

test('a failed write does not leave the Task, lose elapsed time or falsely show free Focus', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await page.clock.fastForward(10000);
  const before = await saved(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lbd-focus-v2-timer')
        throw new DOMException('quota', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await page
    .getByRole('button', { name: 'Về Focus tự do', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Không lưu được thao tác tạm gác' }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
  ).toHaveValue('project');
  await expect(
    page.getByRole('button', { name: 'Tạm dừng', exact: true }),
  ).toBeVisible();
  expect(await saved(page)).toEqual(before);
});
