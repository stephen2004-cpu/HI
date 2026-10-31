import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
});
test('weekday gold chips, finite slots, edits and reload retain history without duplicates', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('GYM giới hạn');
  await page.getByRole('radio', { name: /Sau/ }).check();
  await page.getByLabel('Số lần xuất hiện', { exact: true }).fill('6');
  await expect(page.locator('.habit-repeat-preview')).toContainText(
    'T2, T4, T6 · Tổng 6 lần',
  );
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'GYM giới hạn 2026-10-26: Chưa nhập',
      exact: true,
    })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Sửa thói quen GYM giới hạn', exact: true })
    .click();
  await expect(page.getByRole('radio', { name: /Sau/ })).toBeChecked();
  await expect(
    page.getByLabel('Số lần xuất hiện', { exact: true }),
  ).toHaveValue('6');
  for (const day of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
    await page
      .locator('.habit-repeat')
      .getByLabel(day, { exact: true })
      .check();
  await expect(page.locator('.habit-repeat label.selected')).toHaveCount(7);
  await page.getByLabel('Số lần xuất hiện', { exact: true }).fill('10');
  await page
    .getByRole('button', { name: 'Lưu thói quen', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: 'GYM giới hạn 2026-10-26: Đã làm',
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  const stored = await page.evaluate(() => ({
    habits: JSON.parse(localStorage.getItem('lbd-focus-v2-habits')!),
    planner: JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!),
  }));
  expect(stored.habits.habits).toHaveLength(1);
  expect(stored.habits.habits[0].logs['2026-10-26']).toBe('done');
  expect(
    new Set(stored.planner.blocks.map((b: { id: string }) => b.id)).size,
  ).toBe(stored.planner.blocks.length);
});
test('inclusive ending date and start on an unselected weekday are enforced, including manual connections', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Lịch đến ngày');
  await page.getByLabel('Ngày bắt đầu lặp', { exact: true }).fill('2026-10-27');
  await page.getByRole('radio', { name: /Đến ngày/ }).check();
  await page
    .getByLabel('Ngày kết thúc lặp', { exact: true })
    .fill('2026-10-30');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page.getByLabel('Ngày thực hiện', { exact: true }).fill('2026-11-02');
  await page
    .getByRole('button', { name: 'Lên lịch Lịch đến ngày', exact: true })
    .click();
  await expect(
    page.getByText(
      'Ngày này không thuộc lịch Habit, đang tạm dừng hoặc đã hết giới hạn lặp. Chưa tạo Task hay Time Block.',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(2);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(0);
});
