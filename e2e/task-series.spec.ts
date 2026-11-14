import { test, expect, type Page } from '@playwright/test';
import { seriesFixture } from './task-series-fixture';
const card = (p: Page, date: string) =>
  p
    .locator('.task-card')
    .filter({ has: p.locator('.task-repeat-badge', { hasText: date }) });
async function setup(p: Page) {
  await p.clock.setSystemTime(new Date(2026, 10, 14, 6));
  await p.goto('/#Task');
  const { workspace } = seriesFixture();
  await p.evaluate((w) => {
    for (const [key, value] of Object.entries(w))
      localStorage.setItem(`lbd-focus-v2-${key}`, JSON.stringify(value));
  }, workspace);
  await p.reload();
  await p.getByRole('button', { name: 'Tháng', exact: true }).click();
  await expect(p.locator('.task-repeat-badge')).toHaveCount(5);
}
const raw = (p: Page) =>
  p.evaluate(() => ({
    tasks: JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks,
    planner: JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!),
    timer: localStorage.getItem('lbd-focus-v2-timer'),
  }));
test('scope prompt defers mutations; all-series color/metadata edits preserve private progress and future behavior', async ({
  page,
}, info) => {
  await setup(page);
  const before = await raw(page);
  await card(page, '2026-11-14')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await page.getByLabel('Màu riêng', { exact: true }).fill('#123456');
  await page.getByLabel('Tên công việc', { exact: true }).fill('Bữa sáng');
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  const choice = page.getByRole('group', { name: 'Phạm vi lưu Task lặp' });
  await expect(choice).toBeVisible();
  expect(await raw(page)).toEqual(before);
  await choice.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveValue(
    'Bữa sáng',
  );
  expect(await raw(page)).toEqual(before);
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  if (info.project.name === 'mobile') {
    await choice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/lbd-task-series-scope-mobile.png' });
  }
  await choice
    .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
    .click();
  const after = await raw(page);
  const repeats = after.tasks.filter((t: any) => t.repeatSeriesId);
  expect(repeats).toHaveLength(5);
  expect(
    repeats.every((t: any) => t.title === 'Bữa sáng' && t.color === '#123456'),
  ).toBe(true);
  expect(repeats.find((t: any) => t.repeatDate === '2026-11-15')).toMatchObject(
    {
      completed: true,
      notes: 'Ghi chú riêng',
      checklist: [{ id: 'step', text: 'Chuẩn bị', done: true }],
    },
  );
  expect(after.timer).toEqual(before.timer);
  expect(after.tasks.find((t: any) => t.id === 'independent')).toEqual(
    before.tasks.find((t: any) => t.id === 'independent'),
  );
  expect(after.planner.blocks.map(({ title: _title, ...b }: any) => b)).toEqual(
    before.planner.blocks.map(({ title: _title, ...b }: any) => b),
  );
  expect(
    after.planner.blocks
      .filter((b: any) => b.taskId !== repeats.find((t: any) => t.completed).id)
      .every((b: any) => b.title === 'Bữa sáng'),
  ).toBe(true);
  await card(page, '2026-11-14')
    .getByLabel('Nhóm của Bữa sáng')
    .selectOption('schedule');
  const group = page.getByRole('group', {
    name: 'Phạm vi chuyển nhóm Task lặp',
  });
  expect(
    (await raw(page)).tasks.find((t: any) => t.id === 'breakfast').group,
  ).toBe('eliminate');
  await group
    .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
    .click();
  expect(
    (await raw(page)).tasks
      .filter((t: any) => t.repeatSeriesId)
      .every((t: any) => t.group === 'schedule'),
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Tháng', exact: true }).click();
  await expect(page.locator('.task-repeat-badge')).toHaveCount(5);
  await expect(card(page, '2026-11-15').getByRole('checkbox')).toBeChecked();
});
test('single and whole-series deletion retain history, cancel linked blocks and stay deleted after reload', async ({
  page,
}) => {
  await setup(page);
  const before = await raw(page);
  await card(page, '2026-11-14')
    .getByRole('button', { name: 'Xóa', exact: true })
    .click();
  const choice = page.getByRole('group', { name: 'Xác nhận xóa Task' });
  await choice
    .getByRole('button', { name: 'Chỉ lần này', exact: true })
    .click();
  await expect(card(page, '2026-11-14')).toHaveCount(0);
  await expect(page.locator('.task-repeat-badge')).toHaveCount(4);
  await card(page, '2026-11-15')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })
    .click();
  await choice
    .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
    .click();
  await expect(page.locator('.task-repeat-badge')).toHaveCount(0);
  const after = await raw(page);
  expect(after.tasks).toHaveLength(before.tasks.length);
  expect(
    after.tasks
      .filter((t: any) => t.repeat || t.repeatSeriesId)
      .every((t: any) => t.deletedAt > 0),
  ).toBe(true);
  expect(after.planner.blocks.every((b: any) => b.cancelled)).toBe(true);
  expect(after.timer).toEqual(before.timer);
  await expect(
    page.locator('.task-card').filter({ hasText: 'Task độc lập' }),
  ).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Tháng', exact: true }).click();
  await page
    .getByRole('button', { name: 'Khoảng Task sau', exact: true })
    .click();
  await expect(page.locator('.task-repeat-badge')).toHaveCount(0);
  expect((await raw(page)).tasks).toEqual(after.tasks);
});
test('failed paired storage write rolls back the entire series edit and retains the draft', async ({
  page,
}) => {
  await setup(page);
  await card(page, '2026-11-14')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  const before = await raw(page);
  await page.getByLabel('Màu riêng', { exact: true }).fill('#123456');
  await page
    .getByLabel('Ngày giờ dự kiến', { exact: true })
    .fill('2026-11-14T09:00');
  await page.getByLabel('Giờ kết thúc Task lặp', { exact: true }).fill('10:00');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lbd-focus-v2-planner' && !failed) {
        failed = true;
        throw new DOMException('test quota', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await page
    .getByRole('group', { name: 'Phạm vi lưu Task lặp' })
    .getByRole('button', { name: 'Toàn bộ chuỗi lặp', exact: true })
    .click();
  await expect(page.getByRole('alert').first()).toContainText(
    'Không lưu được Task',
  );
  expect(await raw(page)).toEqual(before);
  await expect(page.getByLabel('Màu riêng', { exact: true })).toHaveValue(
    '#123456',
  );
});
