import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 9, 31, 8));
});
const saved = (page: Page) =>
  page.evaluate(() => ({
    tasks: JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks,
    blocks: JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks,
  }));
async function create(page: Page, timed = true) {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc', { exact: true }).fill('Học VNR');
  await page
    .getByRole('combobox', { name: 'Nhóm ưu tiên', exact: true })
    .selectOption('do');
  await page.getByLabel('Phút mỗi phiên Focus', { exact: true }).fill('60');
  await page.getByLabel('Màu riêng', { exact: true }).fill('#bbaaff');
  if (timed)
    await page
      .getByLabel('Ngày giờ dự kiến', { exact: true })
      .fill('2026-10-31T09:00');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
}
test('one save puts a one-off Task in Eisenhower and Calendar with matching ID/color/time and opens its Focus; reload creates no duplicates', async ({
  page,
}) => {
  await create(page);
  await expect(
    page
      .getByRole('region', { name: 'Làm ngay', exact: true })
      .getByRole('checkbox', { name: 'Học VNR', exact: true }),
  ).toBeVisible();
  const a = await saved(page);
  expect(a.tasks).toHaveLength(1);
  expect(a.blocks).toHaveLength(1);
  expect(a.tasks[0].group).toBe('do');
  expect(a.blocks[0].taskId).toBe(a.tasks[0].id);
  expect(a.blocks[0].start).toBe(+new Date(2026, 9, 31, 9));
  expect(a.blocks[0].end).toBe(+new Date(2026, 9, 31, 10));
  await page.goto('/#Lịch');
  const block = page.getByRole('button', {
    name: 'Time Block Học VNR',
    exact: true,
  });
  await expect(block).toBeVisible();
  await expect(block).toHaveCSS('background-color', 'rgb(187, 170, 255)');
  await block.click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
  ).toHaveValue(a.tasks[0].id);
  await page.reload();
  expect(await saved(page)).toEqual(a);
  await page.goto('/#Task');
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Học VNR đã sửa');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  const b = await saved(page);
  expect(b.tasks).toHaveLength(1);
  expect(b.blocks).toHaveLength(1);
  expect(b.blocks[0].id).toBe(a.blocks[0].id);
  expect(b.blocks[0].title).toBe('Học VNR đã sửa');
});
test('a Task without a clock remains in the unscheduled backlog, then a single edit/save schedules it without a second Task', async ({
  page,
}) => {
  await create(page, false);
  await expect(
    page
      .getByRole('region', { name: 'Task chưa lên lịch', exact: true })
      .getByRole('checkbox', { name: 'Học VNR', exact: true }),
  ).toBeVisible();
  const before = await saved(page);
  expect(before.tasks).toHaveLength(1);
  expect(before.blocks).toHaveLength(0);
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-10-31T09:00');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  const after = await saved(page);
  expect(after.tasks[0].id).toBe(before.tasks[0].id);
  expect(after.tasks).toHaveLength(1);
  expect(after.blocks).toHaveLength(1);
  await page.reload();
  expect(await saved(page)).toEqual(after);
});
test('saving against an existing conflicting block warns without replacing it; old customized and duplicate blocks are preserved', async ({
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
            id: 'keep',
            taskId: 'other',
            title: 'Không thay đổi',
            start: +new Date(2026, 9, 31, 9),
            end: +new Date(2026, 9, 31, 10),
            color: '',
          },
        ],
      }),
    ),
  );
  await page.reload();
  await create(page);
  await expect(page.getByText(/Cảnh báo: 1 lần trùng lịch/)).toBeVisible();
  const a = await saved(page);
  expect(a.blocks).toHaveLength(2);
  expect(a.blocks[0].id).toBe('keep');
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!);
    const b = p.blocks[1];
    p.blocks[1] = {
      ...b,
      automaticTaskId: undefined,
      id: 'legacy-one',
      start: b.start + 3600000,
      end: b.end + 3600000,
    };
    p.blocks.push({ ...p.blocks[1], id: 'legacy-two' });
    localStorage.setItem('lbd-focus-v2-planner', JSON.stringify(p));
  });
  await page.reload();
  const custom = await saved(page);
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByLabel('Tên công việc', { exact: true }).fill('Tên mới');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  expect((await saved(page)).blocks).toEqual(custom.blocks);
  expect((await saved(page)).tasks).toHaveLength(1);
  await page.reload();
  expect((await saved(page)).blocks).toEqual(custom.blocks);
});

test('one save schedules exactly four Tue/Fri occurrences at 15:00–17:15 with correct priority, color and per-occurrence Focus links', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc', { exact: true }).fill('Học VNR');
  await page
    .getByRole('combobox', { name: 'Nhóm ưu tiên', exact: true })
    .selectOption('do');
  await page.getByLabel('Màu riêng', { exact: true }).fill('#bbaaff');
  await page.getByLabel('Kiểu lặp Task').selectOption('weekly');
  await page
    .getByLabel('Ngày bắt đầu Task lặp', { exact: true })
    .fill('2026-10-31');
  for (const d of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
    await page
      .getByLabel(`Task lặp ${d}`, { exact: true })
      .setChecked(d === 'T3' || d === 'T6');
  await page.getByRole('radio', { name: /Sau/ }).check();
  await page.getByLabel('Số lần Task xuất hiện', { exact: true }).fill('4');
  await page
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-10-31T15:00');
  await page.getByLabel('Giờ kết thúc Task lặp', { exact: true }).fill('17:15');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  const data = await saved(page);
  expect(data.blocks).toHaveLength(4);
  expect(
    data.blocks.map((b: { start: number }) => new Date(b.start).getDate()),
  ).toEqual([3, 6, 10, 13]);
  expect(
    data.blocks.every(
      (b: { start: number; end: number }) =>
        new Date(b.start).getHours() === 15 && b.end - b.start === 135 * 60000,
    ),
  ).toBe(true);
  const occurrences = data.tasks.filter(
    (t: { repeatSeriesId?: string }) => t.repeatSeriesId,
  );
  expect(occurrences).toHaveLength(4);
  expect(
    occurrences.every(
      (t: { group: string; color: string }) =>
        t.group === 'do' && t.color === '#bbaaff',
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Tuần', exact: true }).click();
  const first = page
    .locator('.task-card')
    .filter({
      has: page.locator('.task-repeat-badge', { hasText: '2026-11-03' }),
    });
  await first.getByRole('checkbox').check();
  const after = await saved(page);
  expect(
    after.tasks.filter((t: { completed: boolean }) => t.completed),
  ).toHaveLength(1);
  await page.goto('/#Lịch');
  await page.getByLabel('Khoảng sau', { exact: true }).click();
  const blocks = page.getByRole('button', {
    name: 'Time Block Học VNR',
    exact: true,
  });
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(1)).toHaveCSS(
    'background-color',
    'rgb(187, 170, 255)',
  );
  await blocks.nth(1).click();
  const friday = occurrences.find(
    (t: { repeatDate: string }) => t.repeatDate === '2026-11-06',
  );
  await expect(
    page.getByRole('combobox', { name: 'Task đang tập trung', exact: true }),
  ).toHaveValue(friday.id);
  await page.reload();
  expect((await saved(page)).blocks).toHaveLength(4);
});
