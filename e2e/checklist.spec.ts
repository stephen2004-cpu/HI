import { test, expect, type Page } from '@playwright/test';
async function setup(page: Page) {
  await page.goto('/#Task');
  await page.evaluate(() =>
    localStorage.setItem('lbd-focus-v1', 'legacy-checklist-sentinel'),
  );
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Checklist tài liệu');
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: 'Thêm bước', exact: true }).click();
    await page
      .getByLabel(`Nội dung bước ${i}`, { exact: true })
      .fill(`Bước ${i}`);
  }
  await page.getByLabel('Hoàn thành bước 1', { exact: true }).check();
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
}
async function saved(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-tasks')!).tasks[0],
  );
}
test('step document CRUD is collapsed by default, autosaves names/links on an existing Task and preserves old data', async ({
  page,
}) => {
  await setup(page);
  const before = await saved(page);
  const first = page.locator('.checklist-step').first();
  await first
    .getByLabel('Nội dung bước 1', { exact: true })
    .fill('Nội dung nháp');
  expect((await saved(page)).checklist[0].text).toBe(before.checklist[0].text);
  await first
    .getByLabel('Nội dung bước 1', { exact: true })
    .fill(before.checklist[0].text);
  await expect(first.locator('details')).not.toHaveAttribute('open');
  await first.locator('summary').click();
  await expect(first.getByLabel('Đính kèm file')).toBeDisabled();
  await expect(
    first.getByText('Đăng nhập để tải file', { exact: false }),
  ).toBeVisible();
  await first.getByLabel('Tên tài liệu', { exact: true }).fill('Bản kế hoạch');
  await first
    .getByLabel('Link làm việc', { exact: true })
    .fill('javascript:alert(1)');
  await first
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(first.getByRole('alert')).toContainText('http/https');
  expect((await saved(page)).checklist).toEqual(before.checklist);
  await first
    .getByLabel('Link làm việc', { exact: true })
    .fill('https://docs.google.com/document/d/example');
  await first
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(
    first.getByRole('link', { name: 'Mở link', exact: true }),
  ).toHaveAttribute('target', '_blank');
  await expect(
    first.getByRole('link', { name: 'Mở link', exact: true }),
  ).toHaveAttribute('rel', 'noopener noreferrer');
  await first
    .getByLabel('Tên tài liệu', { exact: true })
    .fill('Tên file tham khảo');
  await first
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(first.locator('.step-document')).toHaveCount(2);
  await first
    .getByRole('button', { name: 'Sửa tài liệu Bản kế hoạch', exact: true })
    .click();
  await first.getByLabel('Tên tài liệu', { exact: true }).fill('Kế hoạch mới');
  await first
    .getByLabel('Link làm việc', { exact: true })
    .fill('https://www.notion.so/example');
  await first
    .getByRole('button', { name: 'Lưu tài liệu', exact: true })
    .click();
  await first
    .getByRole('button', {
      name: 'Xóa tài liệu Tên file tham khảo',
      exact: true,
    })
    .click();
  const current = await saved(page);
  expect(current.checklist[0].documents).toHaveLength(1);
  expect(current.checklist[0].documents[0].name).toBe('Kế hoạch mới');
  expect(
    current.checklist.map((s: { id: string; text: string; done: boolean }) => ({
      id: s.id,
      text: s.text,
      done: s.done,
    })),
  ).toEqual(before.checklist);
  expect(current.checklist.slice(1)).toEqual(before.checklist.slice(1));
  await page.screenshot({
    path: `/tmp/lbd-checklist-documents-${test.info().project.name}.png`,
  });
  await page.reload();
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await expect(first.locator('details')).not.toHaveAttribute('open');
  await first.locator('summary').click();
  await expect(
    first.getByRole('article', { name: 'Tài liệu Kế hoạch mới', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lbd-focus-v1'))).toBe(
    'legacy-checklist-sentinel',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('grip supports mouse or long-press touch sorting, keyboard cancel/drop and autosaves without changing done states', async ({
  page,
}) => {
  await setup(page);
  const before = await saved(page);
  const first = page.getByRole('button', {
    name: 'Kéo sắp xếp bước 1',
    exact: true,
  });
  await page
    .locator('.checklist')
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const a = (await first.boundingBox())!;
  const b = (await page
    .getByRole('button', { name: 'Kéo sắp xếp bước 3', exact: true })
    .boundingBox())!;
  const x = a.x + a.width / 2,
    y = a.y + a.height / 2,
    end = b.y + b.height / 2;
  if (test.info().project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(230);
    await expect(page.locator('.checklist-dragging')).toBeVisible();
    for (let i = 1; i <= 12; i++) {
      await page.waitForTimeout(20);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + ((end - y) * i) / 12 }],
      });
    }
    await page.waitForTimeout(80);
    await page.screenshot({ path: '/tmp/lbd-checklist-touch-drag.png' });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, end, { steps: 15 });
    await page.mouse.up();
  }
  await expect(page.getByLabel('Nội dung bước 3', { exact: true })).toHaveValue(
    'Bước 1',
  );
  expect((await saved(page)).checklist).toEqual([
    before.checklist[1],
    before.checklist[2],
    before.checklist[0],
  ]);
  const handle = page.getByRole('button', {
    name: 'Kéo sắp xếp bước 3',
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.checklist-dragging')).toBeVisible();
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(220);
  await page.keyboard.press('Escape');
  expect((await saved(page)).checklist).toEqual([
    before.checklist[1],
    before.checklist[2],
    before.checklist[0],
  ]);
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.checklist-dragging')).toBeVisible();
  await page.waitForTimeout(80);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(220);
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Nội dung bước 2', { exact: true })).toHaveValue(
    'Bước 1',
  );
  expect((await saved(page)).checklist).toEqual([
    before.checklist[1],
    before.checklist[0],
    before.checklist[2],
  ]);
  await page.reload();
  await page
    .locator('.task-card')
    .getByRole('button', { name: 'Sửa', exact: true })
    .click();
  await expect(page.getByLabel('Nội dung bước 2', { exact: true })).toHaveValue(
    'Bước 1',
  );
  await expect(
    page.getByLabel('Hoàn thành bước 2', { exact: true }),
  ).toBeChecked();
});

test('a failed autosave preserves order and documents, reports failure, and reduced motion disables sortable transitions', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  const before = await saved(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lbd-focus-v2-tasks')
        throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const grip = page.getByRole('button', {
    name: 'Kéo sắp xếp bước 1',
    exact: true,
  });
  await grip.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.checklist').getByRole('alert')).toContainText(
    'Không lưu được Checklist',
  );
  expect(await saved(page)).toEqual(before);
  const first = page.locator('.checklist-step').first();
  await expect(first).toHaveCSS('transition-duration', '0s');
  await first.locator('summary').click();
  await first
    .getByLabel('Tên tài liệu', { exact: true })
    .fill('Không được lưu giả');
  await first
    .getByRole('button', { name: 'Thêm tài liệu', exact: true })
    .click();
  await expect(first.getByRole('alert')).toContainText(
    'Không lưu được tài liệu',
  );
  expect(await saved(page)).toEqual(before);
});
