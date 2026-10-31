import { test, expect, type Page } from '@playwright/test';
async function make(
  page: Page,
  ending: 'count' | 'date' | 'unlimited' = 'count',
  time = true,
) {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc', { exact: true }).fill('Học VNR');
  await page.getByLabel('Kiểu lặp Task').selectOption('weekly');
  await page
    .getByLabel('Ngày bắt đầu Task lặp', { exact: true })
    .fill('2026-10-31');
  for (const d of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
    await page
      .getByLabel(`Task lặp ${d}`, { exact: true })
      .setChecked(d === 'T3' || d === 'T6');
  if (ending === 'count') {
    await page.getByRole('radio', { name: /Sau/ }).check();
    await page.getByLabel('Số lần Task xuất hiện', { exact: true }).fill('4');
  }
  if (ending === 'date') {
    await page.getByRole('radio', { name: /Đến ngày/ }).check();
    await page
      .getByLabel('Ngày kết thúc Task lặp', { exact: true })
      .fill('2026-11-06');
  }
  if (time) {
    await page
      .getByLabel('Ngày giờ dự kiến', { exact: true })
      .fill('2026-10-31T09:00');
    await page
      .getByLabel('Giờ kết thúc Task lặp', { exact: true })
      .fill('11:15');
  }
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
}
const blocks = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks,
  );
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 31, 8));
});
test('saves all four timed repeats immediately, renders Calendar without +, reloads without duplicates and edits only one instance', async ({
  page,
}) => {
  await make(page);
  await expect(
    page.getByText('Đã lưu Task. Đã lên lịch 4 lần.', { exact: true }),
  ).toBeVisible();
  let b = await blocks(page);
  expect(b).toHaveLength(4);
  expect(b.map((b: { start: number }) => new Date(b.start).getDate())).toEqual([
    3, 6, 10, 13,
  ]);
  expect(
    b.every(
      (b: { start: number; end: number }) =>
        new Date(b.start).getHours() === 9 && (b.end - b.start) / 60000 === 135,
    ),
  ).toBe(true);
  await page.goto('/#Lịch');
  await page.getByLabel('Chế độ lịch').selectOption('month');
  expect(await blocks(page)).toHaveLength(4);
  await page.reload();
  expect(await blocks(page)).toHaveLength(4);
  await page.goto('/#Task');
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  await page.locator('input[type="date"]').first().fill('2026-11-03');
  const row = page.locator('.task-card').filter({
    has: page.locator('.task-repeat-badge', { hasText: '2026-11-06' }),
  });
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-11-06T15:00');
  await page.getByLabel('Giờ kết thúc Task lặp', { exact: true }).fill('16:00');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  b = await blocks(page);
  expect(new Date(b[1].start).getHours()).toBe(15);
  expect((b[1].end - b[1].start) / 60000).toBe(60);
  expect(new Date(b[0].start).getHours()).toBe(9);
  expect(new Date(b[2].start).getHours()).toBe(9);
  expect(b).toHaveLength(4);
  await page.reload();
  expect(await blocks(page)).toEqual(b);
});
test('inclusive ending date and conflict warning preserve other blocks; no time requests explicit setup', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page.evaluate(() =>
    localStorage.setItem(
      'lbd-focus-v2-planner',
      JSON.stringify({
        version: 1,
        preferences: { weekStart: 1, blockMinutes: 60 },
        blocks: [
          {
            id: 'other',
            taskId: 'old',
            title: 'Giữ lịch cũ',
            start: +new Date(2026, 10, 3, 10),
            end: +new Date(2026, 10, 3, 12),
            color: '',
          },
        ],
      }),
    ),
  );
  await page.reload();
  await make(page, 'date');
  await expect(page.getByText(/Cảnh báo: 1 lần trùng lịch/)).toBeVisible();
  const b = await blocks(page);
  expect(b).toHaveLength(3);
  expect(b.find((b: { id: string }) => b.id === 'other').title).toBe(
    'Giữ lịch cũ',
  );
  await page.reload();
  expect(await blocks(page)).toEqual(b);
  await page.getByRole('button', { name: 'Tạo Task', exact: true }).click();
  await page.getByLabel('Tên công việc', { exact: true }).fill('Chưa có giờ');
  await page.getByLabel('Kiểu lặp Task').selectOption('weekly');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await expect(
    page.getByText(/Chọn ngày giờ dự kiến để tự tạo Time Block/),
  ).toBeVisible();
  expect(await blocks(page)).toEqual(b);
});
test('unlimited repeats only materialize displayed ranges and revisiting never duplicates blocks', async ({
  page,
}) => {
  await make(page, 'unlimited');
  await page.goto('/#Lịch');
  await page.getByLabel('Chế độ lịch').selectOption('month');
  const first = (await blocks(page)).length;
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(20);
  await page.reload();
  expect(await blocks(page)).toHaveLength(first);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
