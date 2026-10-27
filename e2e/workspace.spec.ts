import { test, expect } from '@playwright/test';
test('task setup, calendar to workspace, live edits and outcome remain after reload', async ({
  page,
}) => {
  await page.goto('/#Task');
  await page.getByLabel('Tên công việc').fill('Soạn bài');
  await page
    .getByLabel('Expected Output — Kết quả cần đạt')
    .fill('Một bản nháp hoàn chỉnh');
  await page.getByLabel('Chế độ Timer').selectOption('study');
  await page.getByLabel('Phút mỗi phiên Focus').fill('0.05');
  await page.getByLabel('Số phiên Focus').fill('2');
  await page.getByLabel('Phút nghỉ giữa các phiên').fill('0.03333333333333333');
  await page.getByRole('button', { name: 'Thêm bước', exact: true }).click();
  await page.getByLabel('Nội dung bước 1').fill('Lên dàn ý');
  await page.getByRole('button', { name: 'Thêm bước', exact: true }).click();
  await page.getByLabel('Nội dung bước 2').fill('Viết nháp');
  await page.getByRole('button', { name: 'Đưa bước 2 lên' }).click();
  await expect(page.getByLabel('Nội dung bước 1')).toHaveValue('Viết nháp');
  await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Lịch', exact: true })
    .click();
  await page.locator('.unscheduled-task').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Lưu Time Block', exact: true })
    .click();
  // Newly created short event has a minimum visual hit area.
  await page.locator('.time-block').scrollIntoViewIfNeeded();
  await page.locator('.time-block').press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Soạn bài', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Bắt đầu chuỗi học' }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Chế độ học tập' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Bắt đầu chuỗi học' }).click();
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.run,
  );
  await page
    .getByRole('textbox', { name: 'Notes — Thông tin làm việc', exact: true })
    .fill('Nguồn tham khảo');
  await page.getByLabel('Hoàn thành bước 1').check();
  await page.getByLabel('Actual Output — Kết quả thực tế').fill('Đã có dàn ý');
  const after = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.run,
  );
  // Editing may span natural Study transitions on a slower mobile runner.
  if (after) {
    expect(after.focusRunId).toBe(before.focusRunId);
    expect(after.started).toBe(
      before.started +
        before.sessions
          .slice(before.index, after.index)
          .reduce(
            (n: number, session: { seconds: number }) =>
              n + session.seconds * 1000,
            0,
          ),
    );
    expect(after.blockId).toBe(before.blockId);
  } else {
    const history = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot
          .history,
    );
    expect(
      history.filter(
        (h: { focusRunId: string }) => h.focusRunId === before.focusRunId,
      ),
    ).toHaveLength(3);
    expect(
      history.every((h: { blockId: string }) => h.blockId === before.blockId),
    ).toBe(true);
  }
  await page.reload();
  await expect(
    page.getByRole('textbox', {
      name: 'Notes — Thông tin làm việc',
      exact: true,
    }),
  ).toHaveValue('Nguồn tham khảo');
  await expect(page.getByLabel('Hoàn thành bước 1')).toBeChecked();
  await expect(
    page.getByRole('heading', { name: 'Ghi nhận kết quả phiên' }),
  ).toBeVisible({ timeout: 12000 });
  const entries = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot.history,
  );
  expect(
    entries.reduce(
      (n: number, r: { actualSeconds: number }) => n + r.actualSeconds,
      0,
    ),
  ).toBe(6);
  expect(
    entries.reduce(
      (n: number, r: { breakSeconds: number }) => n + r.breakSeconds,
      0,
    ),
  ).toBe(2);
  await page.getByLabel('Lý do chênh lệch').selectOption('Bị gián đoạn');
  await page
    .getByRole('button', { name: 'Xác nhận Task hoàn thành', exact: true })
    .click();
  await page.getByText('Đã đạt Expected Output', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Lưu kết quả phiên', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Lưu kết quả phiên', exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lbd-focus-v2-reviews')!).length,
    ),
  ).toBe(1);
  await page.reload();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Tiếp tục Task', exact: true }),
  ).toBeVisible();
});

test('overrun, unfinished status and numeric advice use measured data without rewriting history', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lbd-focus-v2-timer')))
    .not.toBeNull();
  await page.evaluate(() => {
    const t = {
      id: 't',
      title: 'Công việc lặp',
      notes: '',
      group: 'schedule',
      color: '',
      completed: false,
      timing: {
        mode: 'timer',
        focusMinutes: 60,
        focusCount: 1,
        breakMinutes: 0,
      },
    };
    localStorage.setItem(
      'lbd-focus-v2-tasks',
      JSON.stringify({ version: 1, tasks: [t] }),
    );
    const timer = JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!);
    timer.snapshot.history = [
      {
        id: 'r',
        focusRunId: 'run',
        taskId: 't',
        name: t.title,
        type: 'Đếm ngược',
        seconds: 4800,
        start: Date.now() - 4800000,
        end: Date.now(),
        status: 'completed',
        actualSeconds: 4800,
        breakSeconds: 0,
        plannedFocusSeconds: 3600,
        plannedCalendarSeconds: 3600,
      },
    ];
    localStorage.setItem('lbd-focus-v2-timer', JSON.stringify(timer));
    localStorage.setItem(
      'lbd-focus-v2-reviews',
      JSON.stringify(
        [3600, 4200, 4800].map((actual, i) => ({
          runId: `old${i}`,
          taskId: 't',
          at: Date.now() - 100000 + i,
          completed: true,
          expectedMet: true,
          reason: 'Công việc nhiều hơn dự kiến',
          comment: '',
          actualOutput: 'Một bản hoàn chỉnh',
          planned: 3600,
          actual,
        })),
      ),
    );
  });
  await page.goto('/#Thống%20kê');
  await page.reload();
  await expect(
    page.getByRole('row').filter({ hasText: 'Công việc lặp' }),
  ).toContainText('33,3%');
  await expect(
    page.getByRole('row').filter({ hasText: 'Công việc lặp' }),
  ).toContainText('nhiều hơn 20 phút');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Focus', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Áp dụng thời gian gợi ý cho lần sau',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Giờ', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Phút', { exact: true })).toHaveValue('10');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lbd-focus-v2-timer')!).snapshot
          .history[0].plannedFocusSeconds,
    ),
  ).toBe(3600);
});
