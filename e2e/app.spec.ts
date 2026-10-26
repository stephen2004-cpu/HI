import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/#Focus');
});
test('timer completes, persists history, exports CSV and clears history', async ({
  page,
}) => {
  await page.getByLabel('Giờ', { exact: true }).fill('0');
  await page.getByLabel('Phút', { exact: true }).fill('0');
  await page.getByLabel('Giây', { exact: true }).fill('2');
  await page
    .getByText('TÊN PHIÊN', { exact: true })
    .locator('..')
    .getByRole('textbox')
    .fill('Kiểm tra 2 giây');
  await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
  await expect(page.getByRole('timer')).toHaveAttribute(
    'aria-label',
    /00 giờ 00 phút/,
  );
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toBeVisible({ timeout: 6000 });
  await page.reload();
  await expect(
    page.getByRole('cell', { name: 'Kiểm tra 2 giây' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole('button', { name: 'Xóa toàn bộ lịch sử' }).click();
  await page.getByRole('button', { name: 'Xóa lịch sử', exact: true }).click();
  await expect(
    page.getByText('Mỗi phút tập trung đều có ý nghĩa'),
  ).toBeVisible();
});
test('pause, reload, resume, restart and end early', async ({ page }) => {
  await page.getByRole('button', { name: '15 giây', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  const label = await page.getByRole('timer').getAttribute('aria-label');
  await page.reload();
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', label!);
  await expect(
    page.getByRole('button', { name: 'Tiếp tục', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await page
    .getByRole('button', { name: 'Khởi động lại', exact: true })
    .click();
  await expect(
    page.getByRole('cell', { name: 'Dừng sớm', exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Kết thúc phiên', exact: true })
    .click();
  await page.getByRole('button', { name: 'Kết thúc', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'Dừng sớm', exact: true }),
  ).toHaveCount(2);
});
test('study editor, automatic transitions, loop and skip', async ({ page }) => {
  await page.getByRole('tab', { name: 'Chế độ học tập' }).click();
  await expect(page.getByText('1 giờ 5 phút', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Thêm nghỉ ngơi', exact: true })
    .click();
  await page.getByLabel('Tên phiên 4', { exact: true }).fill('Nghỉ mới');
  await page.getByRole('button', { name: 'Xóa phiên 4', exact: true }).click();
  for (let i = 1; i <= 3; i++)
    await page
      .getByLabel(`Số phút phiên ${i}`, { exact: true })
      .fill('0.0333333');
  await page
    .getByLabel('Âm thanh phiên 2', { exact: true })
    .selectOption('digital');
  await page.getByRole('switch', { name: 'Lặp lại chuỗi' }).check();
  await page
    .getByRole('button', { name: 'Bắt đầu chuỗi học', exact: true })
    .click();
  await expect(page.getByText('Phiên 2 / 3', { exact: true })).toBeVisible({
    timeout: 6000,
  });
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ qua', exact: true }).click();
  await expect(page.getByText('Phiên 3 / 3', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tiếp tục', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByText('Phiên 1 / 3', { exact: true })).toBeVisible({
    timeout: 6000,
  });
  await page
    .getByRole('button', { name: 'Kết thúc phiên', exact: true })
    .click();
  await page.getByRole('button', { name: 'Kết thúc', exact: true }).click();
});
test('recovers elapsed countdown on reload and renders without horizontal overflow', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: 'disabled',
    path: `test-results/lbd-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: '15 giây', exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!);
    d.snapshot.run.deadline = Date.now() - 1000;
    localStorage.setItem('lbd-focus-v2-timer', JSON.stringify(d));
  });
  await page.reload();
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toBeVisible();
});

test('validates zero time, toggles audio and enters focus view', async ({
  page,
}) => {
  for (const name of ['Giờ', 'Phút', 'Giây'])
    await page.getByLabel(name, { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
  await expect(page.getByRole('status')).toContainText('lớn hơn 0 giây');
  await page.getByRole('button', { name: 'Tắt âm thanh', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Bật âm thanh', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Âm lượng', { exact: true }).fill('35');
  await page.reload();
  await expect(page.getByLabel('Âm lượng', { exact: true })).toHaveValue('35');
  await expect(
    page.getByRole('button', { name: 'Bật âm thanh', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Toàn màn hình', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Thoát toàn màn hình', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Toàn màn hình', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Chế độ học tập' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `test-results/lbd-study-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
});

test('finishes an entire non-looping study chain', async ({ page }) => {
  await page.getByRole('tab', { name: 'Chế độ học tập' }).click();
  for (let i = 1; i <= 3; i++)
    await page
      .getByLabel(`Số phút phiên ${i}`, { exact: true })
      .fill('0.0333333');
  await page
    .getByRole('button', { name: 'Bắt đầu chuỗi học', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Bắt đầu chuỗi học', exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toHaveCount(3);
  await page.reload();
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toHaveCount(3);
});
