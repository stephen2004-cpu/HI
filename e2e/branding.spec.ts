import { test, expect } from '@playwright/test';

test('original Concept 02 mark and native icon assets load across all screens without changing workspace data', async ({
  page,
}) => {
  await page.goto('/');
  const brand = page.getByRole('link', {
    name: 'LBD Focus trang chủ',
    exact: true,
  });
  const mark = brand.locator('img');
  await expect(mark).toHaveAttribute('src', '/brand/falcon-mark.png');
  await expect(mark).toHaveCSS('object-fit', 'contain');
  await expect
    .poll(() =>
      mark.evaluate((img: HTMLImageElement) => [
        img.complete,
        img.naturalWidth,
        img.naturalHeight,
      ]),
    )
    .toEqual([true, 365, 310]);
  await expect(brand).toContainText('LBD FOCUS');
  await expect(brand.locator('small')).toHaveText('BY LỘC BOY ĐẢO');
  await expect(brand.locator('svg')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => !!localStorage.getItem('lbd-focus-v2-timer')),
    )
    .toBe(true);
  const snapshot = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => key.startsWith('lbd-')),
    ),
  );
  for (const name of [
    'Lịch',
    'Task',
    'Thói quen',
    'Focus',
    'Tổng quan',
    'Thống kê',
    'Cài đặt',
  ]) {
    await page
      .getByRole('navigation')
      .getByRole('button', { name, exact: true })
      .click();
    await expect(mark).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => key.startsWith('lbd-')),
      ),
    ),
  ).toEqual(snapshot);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png',
  );
  await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute(
    'href',
    '/icons/favicon-32.png',
  );
  await expect(page.locator('link[href="/favicon.svg"]')).toHaveCount(0);
  const assets = [
    ['/icons/favicon-16.png', 16],
    ['/icons/favicon-32.png', 32],
    ['/icons/favicon-48.png', 48],
    ['/icons/apple-touch-icon.png', 180],
    ['/icons/app-icon-192.png', 192],
    ['/icons/app-icon-512.png', 512],
  ] as const;
  for (const [path, size] of assets) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    const dimensions = await page.evaluate(async (path) => {
      const img = new Image();
      img.src = path;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, path);
    expect(dimensions).toEqual([size, size]);
  }
  const ico = await page.request.get('/favicon.ico');
  expect(ico.ok()).toBe(true);
  const bytes = await ico.body();
  expect([...bytes.subarray(0, 6)]).toEqual([0, 0, 1, 0, 3, 0]);
  await page
    .locator('.header')
    .screenshot({
      path: `/tmp/lbd-falcon-header-${test.info().project.name}.png`,
    });
});
