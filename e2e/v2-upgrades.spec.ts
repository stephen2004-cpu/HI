import { test, expect } from '@playwright/test';
test('permanent habit deletion retains history by default, requires a second purge confirmation and survives reload', async ({
  page,
}) => {
  await page.clock.setSystemTime(new Date(2026, 9, 26, 8));
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('Habit cần xóa');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Habit cần xóa 2026-10-26: Chưa nhập',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Lên lịch Habit cần xóa', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(3);
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.history,
  );
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Sửa thói quen Habit cần xóa', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })
    .click();
  await expect(
    page.getByLabel('Xóa cả lịch sử đánh dấu thói quen'),
  ).not.toBeChecked();
  await page.screenshot({
    path: `/tmp/lbd-delete-dialog-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  await page.reload();
  await page.getByLabel('Hiện thói quen đã lưu trữ').check();
  await expect(
    page.getByRole('button', {
      name: 'Sửa thói quen Habit cần xóa',
      exact: true,
    }),
  ).toHaveCount(0);
  const dead = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-habits')!).habits[0],
  );
  expect(dead.deletedAt > 0).toBe(true);
  expect(dead.logs['2026-10-26']).toBe('done');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot
          .history,
    ),
  ).toEqual(before);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.locator('.time-block')).toHaveCount(0);
  await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
  await expect(page.locator('.time-block')).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Thói quen', exact: true })
    .click();
  await page
    .getByLabel('Tên thói quen', { exact: true })
    .fill('Xóa cả lịch sử');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Xóa cả lịch sử 2026-10-26: Chưa nhập',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Sửa thói quen Xóa cả lịch sử', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })
    .click();
  await page.getByLabel('Xóa cả lịch sử đánh dấu thói quen').check();
  page.once('dialog', (d) => d.dismiss());
  await page
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-habits')!).habits.find(
          (h: { name: string }) => h.name === 'Xóa cả lịch sử',
        ).logs,
    ),
  ).toEqual({});
});

test('completed calendar status follows the source task on every block and all views without changing scheduled time', async ({
  page,
}) => {
  await page.goto('/#Lịch');
  await expect(
    page.getByRole('heading', { name: 'Lịch của bạn' }),
  ).toBeVisible();
  await page.evaluate(() => {
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    localStorage.setItem(
      'lbd-focus-v2-tasks',
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: 't',
            title: 'Task trạng thái',
            notes: '',
            group: 'do',
            color: '',
            completed: false,
          },
        ],
      }),
    );
    localStorage.setItem(
      'lbd-focus-v2-planner',
      JSON.stringify({
        version: 1,
        preferences: { weekStart: 1, blockMinutes: 60 },
        blocks: [0, 1].map((n) => ({
          id: 'b' + n,
          taskId: 't',
          title: 'Task trạng thái',
          start: +start + n * 7200000,
          end: +start + n * 7200000 + 3600000,
          color: '',
        })),
      }),
    );
  });
  await page.reload();
  const planner = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-planner'),
  );
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Task trạng thái', exact: true })
    .check();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.locator('.time-block.task-completed')).toHaveCount(2);
  await page.locator('.time-block').first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `/tmp/lbd-calendar-done-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(page.locator('.time-block .block-completed-label')).toHaveCount(
    2,
  );
  await page
    .getByLabel('Trạng thái Task', { exact: true })
    .selectOption('pending');
  await expect(page.locator('.time-block')).toHaveCount(0);
  await page.getByLabel('Trạng thái Task', { exact: true }).selectOption('all');
  await page.getByLabel('Chế độ lịch', { exact: true }).selectOption('day');
  await expect(page.locator('.time-block.task-completed')).toHaveCount(2);
  await page.getByLabel('Chế độ lịch', { exact: true }).selectOption('month');
  await expect(page.locator('.month-block.task-completed')).toHaveCount(2);
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-planner')),
  ).toBe(planner);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Task trạng thái', exact: true })
    .uncheck();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(page.locator('.task-completed')).toHaveCount(0);
});

test('countdown alarm repeats until acknowledged, remains available across screens, and respects mute', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    Object.assign(window, { alarmNotes: 0, alarmStops: 0 });
    AudioContext.prototype.createOscillator = function () {
      const w = window as unknown as { alarmNotes: number; alarmStops: number };
      w.alarmNotes++;
      const node = original.call(this),
        stop = node.stop.bind(node);
      node.stop = (when?: number) => {
        if (when === undefined) w.alarmStops++;
        stop(when);
      };
      return node;
    };
  });
  await page.goto('/#Focus');
  await page.getByLabel('Giờ', { exact: true }).fill('0');
  await page.getByLabel('Phút', { exact: true }).fill('0');
  await page.getByLabel('Giây', { exact: true }).fill('2');
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Tắt chuông', exact: true }),
  ).toBeVisible({ timeout: 7000 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { alarmNotes: number }).alarmNotes,
      ),
    )
    .toBeGreaterThan(3);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Tắt chuông', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tắt chuông', exact: true }).click();
  const count = await page.evaluate(
    () => (window as unknown as { alarmNotes: number }).alarmNotes,
  );
  await expect(
    page.getByRole('button', { name: 'Tắt chuông', exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(2000);
  expect(
    await page.evaluate(
      () => (window as unknown as { alarmNotes: number }).alarmNotes,
    ),
  ).toBe(count);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Focus', exact: true })
    .click();
  await page.getByRole('button', { name: /Tắt âm thanh/ }).click();
  await page
    .getByRole('button', { name: 'Bắt đầu tập trung', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Tắt chuông', exact: true }),
  ).toBeVisible({ timeout: 7000 });
  expect(
    await page.evaluate(
      () => (window as unknown as { alarmNotes: number }).alarmNotes,
    ),
  ).toBe(count);
  await page
    .getByRole('button', { name: 'Toàn màn hình', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => !!document.fullscreenElement?.querySelector('.alarm-banner'),
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/lbd-alarm-${test.info().project.name}.png`,
  });
  await page.getByRole('button', { name: 'Tắt chuông', exact: true }).click();
  await page
    .getByRole('button', { name: 'Thoát toàn màn hình', exact: true })
    .click();
});

test('Study transitions retain their configured timing, replace one alert, and acknowledgement never restarts or resets the timer', async ({
  page,
}) => {
  await page.goto('/#Focus');
  await page.getByRole('tab', { name: 'Chế độ học tập', exact: true }).click();
  for (let n = 1; n <= 3; n++)
    await page
      .getByLabel(`Số phút phiên ${n}`, { exact: true })
      .fill('0.0333333');
  await page
    .getByRole('button', { name: 'Bắt đầu chuỗi học', exact: true })
    .click();
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toHaveCount(1, { timeout: 6000 });
  await expect(page.locator('.alarm-banner')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tắt chuông', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'Hoàn thành', exact: true }),
  ).toHaveCount(3, { timeout: 10000 });
  await expect(page.locator('.alarm-banner')).toHaveCount(1);
  const history = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.history,
  );
  await page.getByRole('button', { name: 'Tắt chuông', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot
          .history,
    ),
  ).toEqual(history);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.run,
    ),
  ).toBeNull();
});
