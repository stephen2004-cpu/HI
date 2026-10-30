import { test, expect } from '@playwright/test';
test('task CRUD, colors, priority, completion and reload', async ({ page }) => {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc').fill('Task thử');
  await page.getByLabel('Ghi chú', { exact: true }).fill('Ghi chú thử');
  await page.getByLabel('Màu riêng').fill('#aa3377');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  const card = page.locator('.task-card');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByLabel('Tên công việc').fill('Task đã sửa');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await card.getByRole('checkbox').check();
  await card.getByRole('combobox').selectOption('schedule');
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Task chưa lên lịch', exact: true })
      .locator('.task-card'),
  ).toHaveCount(1);
  await expect(card.getByRole('checkbox')).toBeChecked();
  await expect(card.getByRole('combobox')).toHaveValue('schedule');
  await expect(card).toHaveCSS('border-left-color', 'rgb(170, 51, 119)');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer: transfer });
  await page
    .getByRole('region', { name: 'Ủy quyền', exact: true })
    .dispatchEvent('drop', { dataTransfer: transfer });
  await expect(card.getByRole('combobox')).toHaveValue('delegate');
  await expect(card).toHaveCSS('border-left-color', 'rgb(170, 51, 119)');
  await card.getByRole('button', { name: 'Xóa', exact: true }).click();
  await card.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
  await page.reload();
  await expect(card).toHaveCount(0);
});
test('legacy timer is preserved byte for byte', async ({ page }) => {
  await page.goto('/#Focus');
  await expect(page.getByRole('timer')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lbd-focus-v2-timer')))
    .not.toBeNull();
  const legacy = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-timer'),
  );
  await page.evaluate((value) => {
    localStorage.setItem('lbd-focus-v1', value!);
    localStorage.removeItem('lbd-focus-v2-timer');
  }, legacy);
  await page.reload();
  await page.getByRole('button', { name: '15 giây', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('lbd-focus-v1'))).toBe(
    legacy,
  );
  await expect(
    page.getByRole('button', { name: 'Tiếp tục', exact: true }),
  ).toBeVisible();
});
