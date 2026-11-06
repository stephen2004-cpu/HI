import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date(2026, 10, 6, 8));
  await page.goto('/');
});
async function select(page: Page, from = 540, to = 630, release = true) {
  const column = page.getByLabel('Lịch 06/11', { exact: true });
  await column.evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'center' });
    const scroller = el.closest('.calendar-scroll')!;
    scroller.scrollTop = 480;
    window.scrollTo(
      0,
      window.scrollY + scroller.getBoundingClientRect().top - 80,
    );
  });
  const box = (await column.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + from);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + to, { steps: 12 });
  await expect(page.getByLabel('Khoảng thời gian đang chọn')).toContainText(
    [Math.min(from, to), Math.max(from, to)]
      .map((x) => {
        const m = Math.round(x / 15) * 15;
        return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      })
      .join('–'),
  );
  if (release) await page.mouse.up();
  return page.getByRole('dialog', { name: 'Tạo Task từ Calendar' });
}
test('drag Friday 09:00–10:30 opens existing Setup, saves one linked Task/block, reloads and opens Focus', async ({
  page,
}) => {
  const dialog = await select(page);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel('Ngày giờ dự kiến', { exact: true }),
  ).toHaveValue('2026-11-06T09:00');
  await expect(
    dialog.getByLabel('Ngày giờ kết thúc', { exact: true }),
  ).toHaveValue('2026-11-06T10:30');
  await expect(
    dialog.getByLabel('Phút mỗi phiên Focus', { exact: true }),
  ).toHaveValue('90');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('Tạo từ lịch');
  await dialog.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Time Block Tạo từ lịch', exact: true }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Time Block Tạo từ lịch', exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Task', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Làm ngay', exact: true })
      .getByRole('checkbox', { name: 'Tạo từ lịch', exact: true }),
  ).toBeVisible();
  const data = await page.evaluate(() => ({
    tasks: JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks,
    blocks: JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks,
  }));
  expect(data.tasks).toHaveLength(1);
  expect(data.blocks).toHaveLength(1);
  expect(data.blocks[0].taskId).toBe(data.tasks[0].id);
  expect(data.blocks[0].end - data.blocks[0].start).toBe(90 * 60000);
});
test('reverse drag, Cancel, Escape and click never persist a draft; end and duration stay editable', async ({
  page,
}) => {
  const before = await page.evaluate(() =>
    JSON.stringify([
      localStorage.getItem('lbd-focus-v2-tasks'),
      localStorage.getItem('lbd-focus-v2-planner'),
      localStorage.getItem('lbd-focus-v1'),
    ]),
  );
  let dialog = await select(page, 630, 540);
  await expect(
    dialog.getByLabel('Ngày giờ dự kiến', { exact: true }),
  ).toHaveValue('2026-11-06T09:00');
  await dialog
    .getByLabel('Ngày giờ kết thúc', { exact: true })
    .fill('2026-11-06T11:00');
  await expect(
    dialog.getByLabel('Phút mỗi phiên Focus', { exact: true }),
  ).toHaveValue('120');
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  expect(
    await page.evaluate(() =>
      JSON.stringify([
        localStorage.getItem('lbd-focus-v2-tasks'),
        localStorage.getItem('lbd-focus-v2-planner'),
        localStorage.getItem('lbd-focus-v1'),
      ]),
    ),
  ).toBe(before);
  dialog = await select(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify([
        localStorage.getItem('lbd-focus-v2-tasks'),
        localStorage.getItem('lbd-focus-v2-planner'),
        localStorage.getItem('lbd-focus-v1'),
      ]),
    ),
  ).toBe(before);
  const c = page.getByLabel('Lịch 06/11', { exact: true }),
    b = (await c.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + 540);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify([
        localStorage.getItem('lbd-focus-v2-tasks'),
        localStorage.getItem('lbd-focus-v2-planner'),
        localStorage.getItem('lbd-focus-v1'),
      ]),
    ),
  ).toBe(before);
});

test('snaps quarter hours, Escape cancels an active gesture, and an overlap warns without overwriting the existing block', async ({
  page,
}) => {
  await select(page, 547, 638, false);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Khoảng thời gian đang chọn')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let d = await select(page);
  await d.getByLabel('Tên công việc', { exact: true }).fill('Giữ nguyên');
  await d.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  const old = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0],
  );
  d = await select(page, 525, 585);
  await d.getByLabel('Tên công việc', { exact: true }).fill('Trùng lịch');
  await d.getByRole('button', { name: 'Lưu Task', exact: true }).click();
  await expect(page.getByText(/Cảnh báo: \d+ lần trùng lịch/)).toBeVisible();
  const blocks = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks,
  );
  expect(blocks).toHaveLength(2);
  expect(blocks[0]).toEqual(old);
});
