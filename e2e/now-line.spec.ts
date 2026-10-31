import { test, expect } from '@playwright/test';
test.describe('local Calendar', () => {
  test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
  test('Now Line follows local minutes at 09:00, 12:30, 14:45, 23:59, hides on other days/month and updates across midnight', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-10-31T09:00:00+07:00') });
    await page.goto('/');
    const line = page.locator('.calendar-now-line');
    await expect(line).toHaveCount(1);
    await expect(line).toHaveAttribute('data-date', '2026-10-31');
    for (const [time, top] of [
      ['09:00', 540],
      ['12:30', 750],
      ['14:45', 885],
      ['23:59', 1439],
    ] as const) {
      await page.clock.setSystemTime(new Date(`2026-10-31T${time}:00+07:00`));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(line).toHaveCSS('top', `${top}px`);
      await expect(line).toHaveCSS('pointer-events', 'none');
    }
    await page.getByLabel('Chế độ lịch').selectOption('day');
    await expect(line).toHaveCount(1);
    await page
      .getByRole('button', { name: 'Khoảng trước', exact: true })
      .click();
    await expect(line).toHaveCount(0);
    await page.getByRole('button', { name: 'Khoảng sau', exact: true }).click();
    await expect(line).toHaveCount(1);
    await page.getByLabel('Chế độ lịch').selectOption('month');
    await expect(line).toHaveCount(0);
    await page.getByLabel('Chế độ lịch').selectOption('week');
    await page.clock.runFor(61020);
    await expect(line).toHaveAttribute('data-date', '2026-11-01');
    await expect(line).toHaveCSS('top', '0px');
    await page.getByLabel('Chế độ lịch').selectOption('day');
    await expect(line).toHaveCount(0);
  });
  test('scrolls once, leaves user scrolling alone, refreshes on return, and never creates workspace records', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-10-31T14:45:00+07:00') });
    await page.goto('/');
    const scroll = page.locator('.calendar-scroll');
    await expect
      .poll(() => scroll.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const snapshot = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([k]) =>
          /tasks|planner|habits/.test(k),
        ),
      ),
    );
    await scroll.evaluate((el) => {
      el.scrollTop = 80;
    });
    await page.clock.runFor(60020);
    await expect(page.locator('.calendar-now-line')).toHaveCSS('top', '886px');
    expect(await scroll.evaluate((el) => el.scrollTop)).toBe(80);
    await page.clock.setSystemTime(new Date('2026-10-31T18:23:00+07:00'));
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await expect(page.locator('.calendar-now-line')).toHaveCSS('top', '1103px');
    expect(await scroll.evaluate((el) => el.scrollTop)).toBe(80);
    expect(
      await page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([k]) =>
            /tasks|planner|habits/.test(k),
          ),
        ),
      ),
    ).toEqual(snapshot);
  });
  test('Now Line does not intercept Time Block edit or resize actions', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-10-31T09:00:00+07:00') });
    await page.addInitScript(() => {
      const start = +new Date('2026-10-31T09:00:00+07:00');
      localStorage.setItem(
        'lbd-focus-v2-tasks',
        JSON.stringify({
          version: 1,
          tasks: [
            {
              id: 'one',
              title: 'Block trên Now Line',
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
          blocks: [
            {
              id: 'b',
              taskId: 'one',
              title: 'Block trên Now Line',
              start,
              end: start + 3600000,
              color: '',
            },
          ],
        }),
      );
    });
    await page.goto('/');
    await page.getByLabel('Chế độ lịch').selectOption('day');
    await expect(page.locator('.calendar-now-line')).toHaveCSS('z-index', '1');
    await expect(page.locator('.time-block')).toHaveCSS('z-index', '2');
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0],
    );
    await page
      .getByRole('button', {
        name: 'Sửa lịch Block trên Now Line',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Đóng', exact: true })
      .click();
    const handle = page.getByRole('button', {
      name: 'Đổi thời lượng Block trên Now Line',
      exact: true,
    });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0]
              .end,
        ),
      )
      .toBeGreaterThan(before.end);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lbd-focus-v2-planner')!).blocks[0]
            .start,
      ),
    ).toBe(before.start);
  });
});
test('the same instant has the correct local day and position in another device timezone', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTimezoneOverride', {
    timezoneId: 'America/Los_Angeles',
  });
  await page.clock.install({ time: new Date('2026-10-31T01:30:00+07:00') });
  await page.goto('/');
  await expect(page.locator('.calendar-now-line')).toHaveAttribute(
    'data-date',
    '2026-10-30',
  );
  await expect(page.locator('.calendar-now-line')).toHaveCSS('top', '690px');
  await cdp.send('Emulation.setTimezoneOverride', {
    timezoneId: 'Asia/Ho_Chi_Minh',
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.calendar-now-line')).toHaveAttribute(
    'data-date',
    '2026-10-31',
  );
  await expect(page.locator('.calendar-now-line')).toHaveCSS('top', '90px');
  await context.close();
});
