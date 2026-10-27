import { test, expect } from '@playwright/test';
test('guest timer remains usable and account import cannot happen without login', async ({
  page,
}) => {
  await page.goto('/#Focus');
  await page
    .getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Xác nhận nhập dữ liệu khách',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Đóng tài khoản', exact: true })
    .click();
  await page.getByLabel('Giờ', { exact: true }).fill('0');
  await page.getByLabel('Phút', { exact: true }).fill('0');
  await page.getByLabel('Giây', { exact: true }).fill('2');
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toBeVisible({ timeout: 6000 });
});
