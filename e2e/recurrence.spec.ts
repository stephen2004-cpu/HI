import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
});
test('automatic habit schedules multiple weeks, opens Focus, pauses/resumes/ends while preserving history', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Đọc mỗi tuần');
  await page.getByLabel('Phút khi kết nối Focus', { exact: true }).fill('40');
  await page.getByLabel('Ngày bắt đầu lặp', { exact: true }).fill('2026-10-26');
  await page.getByLabel('Giờ bắt đầu lặp', { exact: true }).fill('18:30');
  await expect(
    page.getByLabel('Lịch lặp tự động trên Calendar', { exact: true }),
  ).toBeChecked();
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Đọc mỗi tuần 2026-10-26: Chưa nhập',
      exact: true,
    })
    .click();
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'Lịch', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  await expect(page.locator('.time-block').first()).toContainText('18:30');
  await page.locator('.time-block').first().press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Đọc mỗi tuần', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Phút', { exact: true })).toHaveValue('40');
  await expect(
    page.getByRole('button', { name: 'Bắt đầu tập trung', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.run,
    ),
  ).toBeNull();
  await nav.getByRole('button', { name: 'Lịch', exact: true }).click();
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks.length,
    ),
  ).toBe(6);
  await page.reload();
  await expect(page.locator('.time-block')).toHaveCount(3);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks.length,
    ),
  ).toBe(6);
  await nav.getByRole('button', { name: 'Thói quen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Tạm dừng lịch Đọc mỗi tuần', exact: true })
    .click();
  await nav.getByRole('button', { name: 'Lịch', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(1);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Thói quen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Tiếp tục lịch Đọc mỗi tuần', exact: true })
    .click();
  await nav.getByRole('button', { name: 'Lịch', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks.length,
    ),
  ).toBe(6);
  await nav.getByRole('button', { name: 'Thói quen', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Kết thúc lịch Đọc mỗi tuần', exact: true })
    .click();
  await expect(
    page.getByText('Lịch đã kết thúc', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Tiếp tục lịch Đọc mỗi tuần',
      exact: true,
    }),
  ).toHaveCount(0);
  await nav.getByRole('button', { name: 'Lịch', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.time-block')).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks.length,
    ),
  ).toBe(6);
  await nav.getByRole('button', { name: 'Thói quen', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Đọc mỗi tuần 2026-10-26: Đã làm',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('deleting one recurring instance stays deleted after reload without changing following weeks', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Viết định kỳ');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Sửa lịch Viết định kỳ', exact: true })
    .first()
    .click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Xóa Time Block', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.time-block')).toHaveCount(2);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(3);
});
