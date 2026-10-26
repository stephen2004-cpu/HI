import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
});
test('calendar first navigation, manual scheduling, edit, colors, restore and reporting', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Lịch của bạn' }),
  ).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.locator('.day-column')).toHaveCount(7);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await page.getByLabel('Tên công việc').fill('Lập trình lịch');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await page.getByRole('button', { name: 'Lập trình lịch ＋' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Bắt đầu', { exact: true }).fill('2026-10-26T09:00');
  await dialog.getByLabel('Kết thúc', { exact: true }).fill('2026-10-26T10:30');
  await dialog.getByLabel('Màu Time Block').fill('#cc7799');
  await dialog
    .getByRole('button', { name: 'Lưu Time Block', exact: true })
    .click();
  if (test.info().project.name === 'mobile')
    await page.getByText('Lịch tháng nhỏ', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Chọn ngày 26/10', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(1);
  await page.reload();
  if (test.info().project.name === 'mobile')
    await page.getByText('Lịch tháng nhỏ', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Chọn ngày 26/10', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCSS(
    'background-color',
    'rgb(204, 119, 153)',
  );
  await page.getByLabel('Chế độ lịch').selectOption('day');
  await expect(page.locator('.day-column')).toHaveCount(1);
  await page.getByLabel('Chế độ lịch').selectOption('month');
  await expect(page.locator('.month-grid > section')).toHaveCount(42);
  await page.locator('.month-block').click();
  await dialog.getByLabel('Kết thúc', { exact: true }).fill('2026-10-26T08:00');
  await dialog
    .getByRole('button', { name: 'Lưu Time Block', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('sau giờ bắt đầu');
  await dialog.getByLabel('Kết thúc', { exact: true }).fill('2026-10-26T11:00');
  await dialog
    .getByRole('button', { name: 'Lưu Time Block', exact: true })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thống kê', exact: true })
    .click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Lập trình lịch' }),
  ).toContainText('2 giờ');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Cài đặt', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất bản sao lưu JSON' }).click();
  expect((await download).suggestedFilename()).toBe('lbd-focus-backup.json');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('linked focus continues across navigation and reload and reports actual', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc').fill('Focus task');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Focus', exact: true })
    .click();
  await page
    .getByLabel('Task đang tập trung')
    .selectOption({ label: 'Focus task' });
  await page.getByLabel('Giờ', { exact: true }).fill('0');
  await page.getByLabel('Phút', { exact: true }).fill('0');
  await page.getByLabel('Giây', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Bắt đầu tập trung' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot
            .history.length,
      ),
    )
    .toBe(1);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thống kê', exact: true })
    .click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Focus task' }),
  ).toContainText('2 giây');
  await page.reload();
  await expect(
    page.getByRole('row').filter({ hasText: 'Focus task' }),
  ).toContainText('2 giây');
});
test('task drop, block move and resize persist independently of task priority', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc').fill('Drag task');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  const task = page.locator('.unscheduled-task');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await task.dispatchEvent('dragstart', { dataTransfer: transfer });
  const column = page.locator('.day-column').first();
  const box = (await column.boundingBox())!;
  await column.dispatchEvent('drop', {
    dataTransfer: transfer,
    clientY: box.y + 540,
  });
  await expect(page.locator('.time-block')).toHaveCount(1);
  const original = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0],
  );
  const move = await page.evaluateHandle(() => new DataTransfer());
  await page
    .locator('.time-block')
    .dispatchEvent('dragstart', { dataTransfer: move });
  const target = page.locator('.day-column').nth(1);
  const rect = (await target.boundingBox())!;
  await target.dispatchEvent('drop', {
    dataTransfer: move,
    clientY: rect.y + 600,
  });
  const changed = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0],
  );
  expect(changed.start).not.toBe(original.start);
  expect(changed.end - changed.start).toBe(original.end - original.start);
  const handle = page.locator('.resize-handle');
  await handle.scrollIntoViewIfNeeded();
  await handle.dispatchEvent('pointerdown', { pointerId: 1, clientY: 100 });
  await handle.dispatchEvent('pointermove', { pointerId: 1, clientY: 130 });
  await handle.dispatchEvent('pointerup', { pointerId: 1, clientY: 130 });
  const resized = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0],
  );
  expect(resized.end - changed.end).toBe(30 * 60000);
  await page.reload();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0].end,
    ),
  ).toBe(resized.end);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks[0].group,
    ),
  ).toBe('do');
});
