import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
});
test('habits weekly/monthly logs, edit, archive and restoration remain separate from tasks', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await expect(
    page.getByRole('heading', { name: 'Thói quen của tôi' }),
  ).toBeVisible();
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Đi bộ');
  await page
    .getByLabel('Lịch lặp tự động trên Calendar', { exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Đi bộ 2026-10-26: Chưa nhập', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Đi bộ 2026-10-26: Đã làm', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Đi bộ 2026-10-26: Đã làm', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Đi bộ 2026-10-28: Chưa nhập',
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Đi bộ 2026-10-26: Đã làm', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Đi bộ 2026-10-26: Tạm nghỉ',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Xem thói quen', { exact: true }).selectOption('month');
  await expect(page.locator('.habit-cell')).toHaveCount(31);
  await page
    .getByRole('button', { name: 'Sửa thói quen Đi bộ', exact: true })
    .click();
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Đi bộ nhẹ');
  await page
    .getByRole('button', { name: 'Lưu thói quen', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Đi bộ nhẹ 2026-10-26: Tạm nghỉ',
      exact: true,
    }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Lưu trữ', exact: true }).click();
  await page.getByLabel('Hiện thói quen đã lưu trữ').check();
  await page
    .getByRole('button', { name: 'Khôi phục Đi bộ nhẹ', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Đi bộ nhẹ 2026-10-26: Tạm nghỉ',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks') ?? '{"tasks":[]}')
          .tasks.length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('explicit habit connection reuses occurrence and never checks habit when timer finishes', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Đọc');
  await page
    .getByLabel('Lịch lặp tự động trên Calendar', { exact: true })
    .uncheck();
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Lên lịch Đọc', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(1);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Lên lịch Đọc', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(1);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await page.getByRole('button', { name: 'Focus Đọc', exact: true }).click();
  await page.getByLabel('Giờ', { exact: true }).fill('0');
  await page.getByLabel('Phút', { exact: true }).fill('0');
  await page.getByLabel('Giây', { exact: true }).fill('2');
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ghi nhận kết quả phiên', exact: true }),
  ).toBeVisible({ timeout: 6000 });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Đọc 2026-10-26: Chưa nhập',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks.length,
    ),
  ).toBe(1);
});
