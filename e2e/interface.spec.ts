import { test, expect, type Page } from '@playwright/test';
const stored = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => key.startsWith('lbd-')),
    ),
  );

test('tactile navigation and reduced motion leave workspace data unchanged', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#Focus');
  await expect(
    page.getByRole('button', { name: 'Bắt đầu tập trung', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => !!localStorage.getItem('lbd-focus-v2-timer')),
    )
    .toBe(true);
  const before = await stored(page);
  const button = page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true });
  await expect(button).not.toHaveCSS('box-shadow', 'none');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(button).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 3)');
  await page.mouse.up();
  await expect(page.locator('.task-board')).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const focus = page
    .getByRole('navigation')
    .getByRole('button', { name: 'Focus', exact: true });
  await focus.click();
  await expect(page.locator('.focus-workspace')).toBeVisible();
  await expect(focus).toHaveCSS('transition-duration', '0s');
  await expect(focus).toHaveCSS('transform', 'none');
  await expect
    .poll(() =>
      page
        .locator('.focus-workspace')
        .evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === 'running').length,
        ),
    )
    .toBe(0);
  expect(await stored(page)).toEqual(before);
});

test('completion feedback follows actual saved state and never celebrates a failed task write', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Phản hồi đúng trạng thái');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  const card = page.locator('.task-card'),
    check = card.getByRole('checkbox');
  await expect(card).not.toHaveClass(/task-done/);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restoreUiStorage: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lbd-focus-v2-tasks')
        throw new DOMException('test quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await check.click();
  await expect(page.getByRole('alert')).toContainText('Không lưu được Task');
  await expect(check).not.toBeChecked();
  await expect(card).not.toHaveClass(/task-done/);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks[0]
          .completed,
    ),
  ).toBe(false);
  await page.evaluate(() =>
    (window as unknown as { restoreUiStorage: () => void }).restoreUiStorage(),
  );
  await check.check();
  await expect(card).toHaveClass(/task-done/);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks[0]
          .completed,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator('.task-card')).toHaveClass(/task-done/);
});

test('calendar drag affordances cancel cleanly without changing data or hour geometry', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Kéo thử không lưu');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  const before = await stored(page),
    source = page.locator('.unscheduled-task'),
    column = page.locator('.day-column').first();
  const bounds = (await column.boundingBox())!,
    transfer = await page.evaluateHandle(() => new DataTransfer());
  const slotHeight = await page
    .locator('.hour-slot')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  await source.dispatchEvent('dragstart', { dataTransfer: transfer });
  await expect(source).toHaveAttribute('data-ui-drag-source', '');
  await column.dispatchEvent('dragover', {
    dataTransfer: transfer,
    clientY: bounds.y + 120,
  });
  await expect(column).toHaveAttribute('data-ui-drop-target', '');
  expect(await stored(page)).toEqual(before);
  expect(
    await page
      .locator('.hour-slot')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(slotHeight);
  await source.dispatchEvent('dragend', { dataTransfer: transfer });
  await expect(
    page.locator('[data-ui-drag-source],[data-ui-drop-target]'),
  ).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
});

test('all seven screens and account panel remain usable at narrow widths', async ({
  page,
}) => {
  await page.goto('/');
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
    await expect(page.locator('main')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole('button', { name: 'Đăng nhập / Đăng ký', exact: true })
    .click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Quên mật khẩu?', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
