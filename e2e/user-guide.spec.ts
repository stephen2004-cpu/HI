import { expect, test } from '@playwright/test';

const titles = [
  'Bắt đầu',
  'Task & Eisenhower',
  'Calendar',
  'Focus',
  'Habit',
  'Tài khoản & đồng bộ',
];

test('help is readable, collapsible, modal and read-only on every screen', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() => !!localStorage.getItem('lbd-focus-v2-timer')),
    )
    .toBe(true);
  await page.evaluate(() =>
    localStorage.setItem('lbd-focus-v1', 'legacy-preservation-sentinel'),
  );
  const before = await page.evaluate(() => ({ ...localStorage }));
  const trigger = page.getByRole('button', {
    name: 'Hướng dẫn sử dụng',
    exact: true,
  });
  const drawer = page.getByRole('dialog', { name: 'Hướng dẫn sử dụng' });
  for (const screen of [
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
      .getByRole('button', { name: screen, exact: true })
      .click();
    const hash = await page.evaluate(() => location.hash);
    await trigger.click();
    await expect(drawer).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(
      drawer.getByRole('button', { name: 'Đóng hướng dẫn' }),
    ).toBeFocused();
    expect(
      await page.evaluate(() =>
        document.querySelector('#user-guide')?.matches(':modal'),
      ),
    ).toBe(true);
    for (const title of titles) {
      const section = drawer.locator('details').filter({
        has: page.locator('summary', { hasText: title }),
      });
      await expect(section).toHaveCount(1);
      if ((await section.getAttribute('open')) === null)
        await section.locator('summary').click();
      await expect(section.locator('ol')).toBeVisible();
      expect(await section.locator('li').count()).toBeGreaterThanOrEqual(3);
      await section.locator('summary').click();
      await expect(section.locator('ol')).toBeHidden();
    }
    const bounds = await drawer.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(Math.round(bounds!.x + bounds!.width)).toBe(
      page.viewportSize()!.width,
    );
    expect(
      await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await drawer.getByRole('button', { name: 'Đóng hướng dẫn' }).click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => location.hash)).toBe(hash);
  }
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await drawer.locator('summary').first().click();
  await page.screenshot({
    animations: 'disabled',
    path: `/tmp/lbd-guide-${test.info().project.name}.png`,
  });
  await expect(page.locator('.wordmark img')).toHaveAttribute(
    'src',
    '/brand/falcon-mark.png',
  );
});

test('help leaves a running timer active and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#Focus');
  await page.getByRole('button', { name: '15 giây', exact: true }).click();
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  const timer = page.getByRole('timer');
  const before = await timer.getAttribute('aria-label');
  await page
    .getByRole('button', { name: 'Hướng dẫn sử dụng', exact: true })
    .click();
  const drawer = page.getByRole('dialog', { name: 'Hướng dẫn sử dụng' });
  await expect(drawer).toHaveCSS('animation-name', 'none');
  await expect.poll(() => timer.getAttribute('aria-label')).not.toBe(before);
  await drawer.getByRole('button', { name: 'Đóng hướng dẫn' }).click();
  await expect(
    page.getByRole('button', { name: 'Tạm dừng', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tiếp tục', exact: true }),
  ).toHaveCount(0);
});
