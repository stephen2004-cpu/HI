import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
});
async function make(page: Page) {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc', { exact: true }).fill('Task lặp');
  await expect(page.getByLabel('Kiểu lặp Task')).toHaveValue('none');
  await page.getByLabel('Kiểu lặp Task').selectOption('weekly');
  for (const day of ['T2', 'T4', 'T6'])
    await page.getByLabel(`Task lặp ${day}`, { exact: true }).check();
  await page.getByRole('radio', { name: /Sau/ }).check();
  await page.getByLabel('Số lần Task xuất hiện', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Thêm bước', exact: true }).click();
  await page
    .getByLabel('Nội dung bước 1', { exact: true })
    .fill('Giữ Checklist');
  await page.locator('.checklist-step').first().locator('summary').click();
  await page.getByLabel('Tên tài liệu', { exact: true }).fill('Link gốc');
  await page
    .getByLabel('Link làm việc', { exact: true })
    .fill('https://www.notion.so/original');
  await page
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(page.locator('.task-repeat-preview')).toContainText(
    'Tổng 5 lần',
  );
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(page.locator('.task-card')).toHaveCount(3);
}
const card = (page: Page, date: string) =>
  page
    .locator('.task-card')
    .filter({ has: page.locator('.task-repeat-badge', { hasText: date }) });
test('Task repeat generates independent dated work, supports single/future edits, preserves documents and never creates Time Blocks', async ({
  page,
}) => {
  await make(page);
  await card(page, '2026-10-26').getByRole('checkbox').check();
  await expect(
    card(page, '2026-10-28').getByRole('checkbox'),
  ).not.toBeChecked();
  await card(page, '2026-10-28')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await expect(page.getByLabel('Phạm vi chỉnh sửa Task lặp')).toHaveValue(
    'single',
  );
  await page.getByLabel('Tên công việc', { exact: true }).fill('Lần sửa riêng');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect(card(page, '2026-10-28')).toContainText('Lần sửa riêng');
  await expect(card(page, '2026-10-30')).toContainText('Task lặp');
  await card(page, '2026-10-26')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await page.getByLabel('Phạm vi chỉnh sửa Task lặp').selectOption('future');
  await page.getByLabel('Tên công việc', { exact: true }).fill('Tên tương lai');
  await page.getByLabel('Số lần Task xuất hiện', { exact: true }).fill('10');
  await page.locator('.checklist-step').first().locator('summary').click();
  await page
    .getByLabel('Tên tài liệu', { exact: true })
    .fill('Tài liệu tương lai');
  await page
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.find(
          (t: { repeatDate: string }) => t.repeatDate === '2026-10-26',
        ).checklist[0].documents.length,
    ),
  ).toBe(1);

  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect(card(page, '2026-10-26')).toContainText('Task lặp');
  await expect(card(page, '2026-10-26').getByRole('checkbox')).toBeChecked();
  await expect(card(page, '2026-10-28')).toContainText('Lần sửa riêng');
  await expect(card(page, '2026-10-30')).toContainText('Tên tương lai');
  const data = await page.evaluate(() => ({
    tasks: JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks,
    planner: localStorage.getItem('lbd-focus-v2-planner'),
  }));
  expect(data.tasks.filter((t: { repeat?: unknown }) => t.repeat)).toHaveLength(
    1,
  );
  expect(
    data.tasks.find(
      (t: { repeatDate: string }) => t.repeatDate === '2026-10-26',
    ).checklist[0].documents,
  ).toHaveLength(1);
  expect(
    data.tasks.find(
      (t: { repeatDate: string }) => t.repeatDate === '2026-10-30',
    ).checklist[0].documents,
  ).toHaveLength(2);
  expect(
    data.planner === null || JSON.parse(data.planner).blocks.length === 0,
  ).toBe(true);
  expect(
    data.tasks
      .filter((t: { repeatSeriesId?: string }) => t.repeatSeriesId)
      .every(
        (t: { checklist: { documents: { name: string }[] }[] }) =>
          t.checklist[0].documents[0].name === 'Link gốc',
      ),
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(page.locator('.task-card')).toHaveCount(3);
  await expect(card(page, '2026-10-26').getByRole('checkbox')).toBeChecked();
});
test('deleted occurrences never regenerate and a nonmatching start respects an inclusive end date', async ({
  page,
}) => {
  await make(page);
  await card(page, '2026-10-28')
    .getByRole('button', { name: 'Xóa', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Xác nhận xóa Task' })
    .getByRole('button', { name: 'Xác nhận xóa', exact: true })
    .click();
  await expect(page.locator('.task-card')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await expect(card(page, '2026-10-28')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Khoảng Task sau', exact: true })
    .click();
  await expect(page.locator('.task-card')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Khoảng Task sau', exact: true })
    .click();
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo Task', exact: true }).click();
  await page.getByLabel('Tên công việc', { exact: true }).fill('Đến ngày');
  await page.getByLabel('Kiểu lặp Task').selectOption('weekly');
  for (const day of ['T2', 'T4', 'T6'])
    await page.getByLabel(`Task lặp ${day}`, { exact: true }).check();
  await page.getByLabel('Ngày bắt đầu Task lặp').fill('2026-10-27');
  await page.getByRole('radio', { name: /Đến ngày/ }).check();
  await page.getByLabel('Ngày kết thúc Task lặp').fill('2026-10-30');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await expect(
    page.locator('.task-card').filter({ hasText: 'Đến ngày' }),
  ).toHaveCount(2);
});
