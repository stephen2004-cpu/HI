import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
});
async function seed(page: Page) {
  await page.goto('/#Task');
  await expect(page.getByLabel('Tên công việc', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const base = { notes: '', color: '', completed: false };
    localStorage.setItem(
      'lbd-focus-v2-tasks',
      JSON.stringify({
        version: 1,
        tasks: [
          {
            ...base,
            id: 'today',
            title: 'Việc hôm nay',
            group: 'do',
            plannedStart: '2026-10-25T09:00',
          },
          {
            ...base,
            id: 'done',
            title: 'Việc đã xong',
            group: 'delegate',
            completed: true,
            plannedStart: '2026-10-26T14:00',
          },
          {
            ...base,
            id: 'future',
            title: 'Việc tuần sau',
            group: 'schedule',
            plannedStart: '2026-11-02T10:00',
          },
          {
            ...base,
            id: 'late',
            title: 'Việc quá hạn',
            group: 'do',
            plannedStart: '2026-10-25T09:00',
          },
          {
            ...base,
            id: 'none',
            title: 'Việc chưa lên lịch',
            group: 'eliminate',
          },
        ],
      }),
    );
    const time = (day: number, hour: number) => +new Date(2026, 9, day, hour);
    localStorage.setItem(
      'lbd-focus-v2-planner',
      JSON.stringify({
        version: 1,
        preferences: { weekStart: 1, blockMinutes: 60 },
        blocks: [
          {
            id: 'a',
            taskId: 'today',
            title: 'Việc hôm nay',
            start: time(26, 9),
            end: time(26, 10),
            color: '',
          },
          {
            id: 'b',
            taskId: 'today',
            title: 'Việc hôm nay',
            start: time(26, 14),
            end: time(26, 15),
            color: '',
          },
          {
            id: 'c',
            taskId: 'today',
            title: 'Việc hôm nay',
            start: time(27, 9),
            end: time(27, 10),
            color: '',
          },
        ],
      }),
    );
    localStorage.setItem('lbd-focus-v1', 'legacy-preserved-verbatim');
  });
  await page.reload();
  await expect(page.locator('.eisenhower-grid .task-card')).toHaveCount(2);
}
const period = (page: Page, name: string) =>
  page
    .getByRole('group', { name: 'Khoảng thời gian Task', exact: true })
    .getByRole('button', { name, exact: true });
const board = (page: Page) => page.locator('.eisenhower-grid');

test('day/week/month filters deduplicate blocks, count status correctly, preserve storage and keep separate backlogs', async ({
  page,
}) => {
  await seed(page);
  const snapshot = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([k]) => k.startsWith('lbd-')),
    ),
  );
  await expect(period(page, 'Ngày')).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByLabel('Ngày tham chiếu Task', { exact: true }),
  ).toHaveValue('2026-10-26');
  await expect(
    board(page).locator('.task-card').filter({ hasText: 'Việc hôm nay' }),
  ).toContainText('2 lần lên lịch');
  await expect(
    page
      .getByRole('region', { name: 'Task chưa lên lịch', exact: true })
      .locator('.task-card'),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole('region', { name: 'Task quá hạn', exact: true })
      .locator('.task-card'),
  ).toHaveCount(1);
  await expect(page.locator('.task-period-heading')).toContainText(
    '2/2 Task trong khoảng · 1 đã hoàn thành',
  );
  await page
    .getByLabel('Trạng thái Task', { exact: true })
    .selectOption('done');
  await expect(board(page).locator('.task-card')).toHaveCount(1);
  await expect(board(page)).toContainText('✓ Đã hoàn thành');
  await page.getByLabel('Trạng thái Task', { exact: true }).selectOption('all');
  const toggle = page.getByRole('button', {
    name: 'Thu gọn/mở rộng Làm ngay',
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(
    board(page).getByText('Việc hôm nay', { exact: true }),
  ).toBeHidden();
  await toggle.click();
  await period(page, 'Tuần').click();
  await expect(board(page).locator('.task-card')).toHaveCount(2);
  await expect(board(page)).toContainText('3 lần lên lịch');
  await period(page, 'Tháng').click();
  await expect(board(page).locator('.task-card')).toHaveCount(3);
  await expect(
    page
      .getByRole('region', { name: 'Task quá hạn', exact: true })
      .locator('.task-card'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Task quá hạn', exact: true }),
  ).toContainText('đã hiển thị trong 4 nhóm');
  await page
    .getByRole('button', { name: 'Khoảng Task sau', exact: true })
    .click();
  await expect(board(page).locator('.task-card')).toHaveCount(1);
  await expect(board(page)).toContainText('Việc tuần sau');
  await page
    .getByRole('button', { name: 'Khoảng Task trước', exact: true })
    .click();
  await expect(board(page).locator('.task-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await period(page, 'Ngày').click();
  await page
    .getByRole('button', { name: 'Khoảng Task sau', exact: true })
    .click();
  await expect(board(page).locator('.task-card')).toHaveCount(1);
  await page
    .getByLabel('Ngày tham chiếu Task', { exact: true })
    .fill('2026-10-26');
  await expect(board(page).locator('.task-card')).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([k]) => k.startsWith('lbd-')),
      ),
    ),
  ).toEqual(snapshot);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/lbd-task-period-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('backlog scheduling opens a draft, cancellation writes nothing, and rescheduling keeps old dates and blocks', async ({
  page,
}) => {
  await seed(page);
  const before = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-planner'),
  );
  await page
    .getByRole('region', { name: 'Task chưa lên lịch', exact: true })
    .getByRole('button', { name: 'Mở Calendar', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Task liên kết')).toHaveValue('none');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-planner')),
  ).toBe(before);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Task quá hạn', exact: true })
    .getByRole('button', { name: 'Lên lịch lại', exact: true })
    .click();
  await expect(dialog.getByLabel('Task liên kết')).toHaveValue('late');
  await dialog.getByLabel('Bắt đầu', { exact: true }).fill('2026-10-28T11:00');
  await dialog.getByLabel('Kết thúc', { exact: true }).fill('2026-10-28T12:00');
  await dialog
    .getByRole('button', { name: 'Lưu Time Block', exact: true })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Task quá hạn', exact: true })
      .locator('.task-card'),
  ).toHaveCount(0);
  await page
    .getByLabel('Ngày tham chiếu Task', { exact: true })
    .fill('2026-10-28');
  await expect(board(page).locator('.task-card')).toHaveCount(1);
  await expect(board(page)).toContainText('Việc quá hạn');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.find(
          (t: { id: string }) => t.id === 'late',
        ).plannedStart,
    ),
  ).toBe('2026-10-25T09:00');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks.length,
    ),
  ).toBe(4);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});

test('habit ranges reuse stable occurrences, preserve habit logs and cannot recreate an explicitly deleted task', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page
    .getByLabel('Tên thói quen', { exact: true })
    .fill('Habit theo khoảng');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Habit theo khoảng 2026-10-26: Chưa nhập',
      exact: true,
    })
    .click();
  const habit = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-habits'),
  );
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await expect(board(page).locator('.task-card')).toHaveCount(1);
  await expect(board(page)).toContainText('Lần thực hiện Habit');
  await expect(board(page).getByRole('checkbox')).not.toBeChecked();
  await period(page, 'Tuần').click();
  await expect(board(page).locator('.task-card')).toHaveCount(3);
  await period(page, 'Tháng').click();
  await expect(board(page).locator('.task-card')).toHaveCount(3);
  const initial = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.map(
      (t: { id: string }) => t.id,
    ),
  );
  for (let i = 0; i < 2; i++) {
    await period(page, 'Ngày').click();
    await period(page, 'Tuần').click();
    await period(page, 'Tháng').click();
  }
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.map(
        (t: { id: string }) => t.id,
      ),
    ),
  ).toEqual(initial);
  await period(page, 'Ngày').click();
  const removed = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.find(
        (t: { habitDate: string }) => t.habitDate === '2026-10-26',
      ).id,
  );
  await board(page).getByRole('button', { name: 'Xóa', exact: true }).click();
  await board(page)
    .getByRole('button', { name: 'Xác nhận xóa', exact: true })
    .click();
  await period(page, 'Tuần').click();
  await period(page, 'Ngày').click();
  await page.reload();
  await expect(board(page).locator('.task-card')).toHaveCount(0);
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.some(
          (t: { id: string }) => t.id === id,
        ),
      removed,
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-habits')),
  ).toBe(habit);
});
