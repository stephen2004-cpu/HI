import { test, expect } from '@playwright/test';

test('an incoming tombstone hides a mounted Habit table and stale editing cannot restore it', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('GYM');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Sửa thói quen GYM', exact: true })
    .click();
  const stored = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-habits'),
  );
  // An existing workspace writer notifies this mounted component, without navigating away.
  await page.evaluate(async () => {
    const { loadHabits, saveHabits, deleteHabit } =
      await import('/src/habits.ts');
    saveHabits(loadHabits().habits.map((h) => deleteHabit(h)));
  });
  await expect(page.locator('.habit-table tbody tr')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Lưu thói quen', exact: true })
    .click();
  await expect(page.locator('.habit-table tbody tr')).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Hiện thói quen đã lưu trữ').check();
  await expect(page.locator('.habit-table tbody tr')).toHaveCount(0);
  const dead = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-habits')!).habits[0],
  );
  expect(dead.deletedAt).toBeGreaterThan(0);
  expect(dead.id).toBe(JSON.parse(stored!).habits[0].id);
});

test('failed local tombstone write stays in the confirmation and preserves the Habit document', async ({
  page,
}) => {
  await page.goto('/#Thói%20quen');
  await page.getByLabel('Tên thói quen', { exact: true }).fill('GYM');
  await page
    .getByRole('button', { name: 'Tạo thói quen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Sửa thói quen GYM', exact: true })
    .click();
  const before = await page.evaluate(() =>
    localStorage.getItem('lbd-focus-v2-habits'),
  );
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lbd-focus-v2-habits')
        throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Xóa vĩnh viễn thói quen?' });
  await dialog
    .getByRole('button', { name: 'Xác nhận xóa vĩnh viễn', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Không lưu được dấu xóa',
  );
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('lbd-focus-v2-habits')),
  ).toBe(before);
  await dialog.getByRole('button', { name: 'Hủy xóa', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sửa thói quen GYM', exact: true }),
  ).toBeVisible();
});
