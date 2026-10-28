import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
const client = () =>
  createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const password = () => `Lbd-${randomUUID()}!`;
function mailbox(email: string) {
  const messages = JSON.parse(
    readFileSync('/tmp/lbd-auth-stack/mailbox.json', 'utf8'),
  ) as { recipient: string; raw: string }[];
  return messages.filter((m) => m.recipient === email);
}
function emailLink(email: string) {
  const raw = mailbox(email).at(-1)!.raw;
  const decoded = raw
    .replace(/=\r\n/g, '')
    .replace(/=([0-9a-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const link = decoded.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
  if (!link || new URL(link).origin !== cfg.url)
    throw Error(
      'Local recovery email did not contain the expected verification link.',
    );
  return link;
}
async function login(page: Page, email: string, pass: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
  await page
    .getByRole('button', { name: 'Đăng nhập bằng email', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tài khoản & đồng bộ', exact: true }),
  ).toBeVisible();
}
for (const mobile of [false, true]) {
  test(`real recovery email → link → password update → login; data retained (${mobile ? 'mobile' : 'desktop'})`, async ({
    browser,
  }) => {
    const context = await browser.newContext(
      mobile
        ? {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          }
        : { viewport: { width: 1440, height: 1000 } },
    );
    const page = await context.newPage();
    const email = `recovery-${randomUUID()}@example.com`,
      oldPass = password(),
      newPass = password();
    const account = client();
    const signup = await account.auth.signUp({ email, password: oldPass });
    expect(signup.error === null).toBe(true);
    // An actual account Task proves reset is not a new account / data reset.
    await page.goto('/?auth=login#Task');
    await login(page, email, oldPass);
    await expect(
      page.getByLabel('Tên công việc', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Tên công việc', { exact: true })
      .fill('Giữ Task sau khôi phục');
    await page.getByRole('button', { name: 'Thêm Task', exact: true }).click();
    await expect(page.locator('.sync-status')).toContainText('Đã đồng bộ', {
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page
      .getByRole('button', { name: 'Quên mật khẩu?', exact: true })
      .click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page
      .getByRole('button', { name: 'Gửi email khôi phục', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Nếu email thuộc' }),
    ).toBeVisible();
    await expect.poll(() => mailbox(email).length).toBeGreaterThan(0);
    // Seed ALL existing guest document keys with sentinels only after the guest
    // workspace unmounts. The recovery-only page must not read/write any of them.
    const link = emailLink(email);
    const response = await fetch(link, { redirect: 'manual' });
    expect(response.status).toBe(303);
    const callback = response.headers.get('location');
    expect(!!callback).toBe(true);
    await page.goto('/?auth=recovery');
    const snapshot = await page.evaluate(() => {
      for (const key of [
        'lbd-focus-v1',
        'lbd-focus-v2-timer',
        'lbd-focus-v2-tasks',
        'lbd-focus-v2-planner',
        'lbd-focus-v2-habits',
        'lbd-focus-v2-reviews',
      ])
        localStorage.setItem(key, JSON.stringify({ sentinel: key }));
      return Object.fromEntries(
        Object.entries(localStorage).filter(
          ([key]) => key !== 'lbd-supabase-auth',
        ),
      );
    });
    const callbackParams = new URLSearchParams(
      new URL(callback!).hash.slice(1),
    );
    const sensitiveValues = [
      newPass,
      oldPass,
      callbackParams.get('access_token'),
      callbackParams.get('refresh_token'),
    ].filter((v): v is string => !!v);
    const sensitiveConsole: string[] = [];
    page.on('console', (m) => {
      if (
        /access_token|refresh_token/.test(m.text()) ||
        sensitiveValues.some((value) => m.text().includes(value))
      )
        sensitiveConsole.push('sensitive output');
    });
    await page.goto(callback!);
    await expect(
      page.getByRole('heading', { name: 'Đặt mật khẩu mới', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.app-header')).toHaveCount(0);
    expect(
      await page.evaluate(() => location.hash.includes('access_token')),
    ).toBe(false);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Đặt mật khẩu mới', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/lbd-recovery-${mobile ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(newPass);
    await page
      .getByLabel('Xác nhận mật khẩu', { exact: true })
      .fill('Mismatch-123!');
    await page
      .getByRole('button', { name: 'Lưu mật khẩu', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveText(
      'Hai mật khẩu chưa trùng nhau.',
    );
    // Test a failed update without displaying backend details, then retry for real.
    await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(newPass);
    await page.route('**/auth/v1/user', async (route) => {
      if (route.request().method() === 'PUT')
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error_code: 'weak_password',
            msg: 'test policy error',
          }),
        });
      else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Lưu mật khẩu', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('chính sách bảo mật');
    await page.unroute('**/auth/v1/user');
    await page
      .getByRole('button', { name: 'Lưu mật khẩu', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Đổi mật khẩu thành công',
        exact: true,
      }),
    ).toBeVisible();
    expect(sensitiveConsole).toHaveLength(0);
    const after = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(
          ([key]) => key !== 'lbd-supabase-auth',
        ),
      ),
    );
    expect(after).toEqual(snapshot);
    // Restore guest sentinels before reopening the normal app (not valid app documents).
    await page.evaluate(() => {
      for (const key of [
        'lbd-focus-v1',
        'lbd-focus-v2-timer',
        'lbd-focus-v2-tasks',
        'lbd-focus-v2-planner',
        'lbd-focus-v2-habits',
        'lbd-focus-v2-reviews',
      ])
        localStorage.removeItem(key);
    });
    await page
      .getByRole('button', { name: 'Về màn hình đăng nhập', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Đăng nhập', exact: true }),
    ).toBeVisible();
    expect(
      (await client().auth.signInWithPassword({ email, password: oldPass }))
        .error !== null,
    ).toBe(true);
    await login(page, email, newPass);
    await page.getByRole('button', { name: 'Task', exact: true }).click();
    await expect(page.locator('.task-card')).toContainText(
      'Giữ Task sau khôi phục',
    );
    await context.close();
    await account.auth.signOut();
  });
}

test('expired, missing, invalid and reused links stay out of Calendar; retry email and network errors are clear', async ({
  page,
}) => {
  for (const url of [
    '/?auth=recovery',
    '/#error=access_denied&error_code=otp_expired&error_description=Link+expired',
    '/?auth=recovery#access_token=invalid&refresh_token=invalid&type=recovery',
  ]) {
    await page.goto(url);
    await expect(
      page.getByRole('heading', {
        name: 'Liên kết khôi phục không hợp lệ',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Mật khẩu mới', { exact: true })).toHaveCount(
      0,
    );
  }
  await page
    .getByRole('button', { name: 'Về màn hình đăng nhập', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Quên mật khẩu?', exact: true })
    .click();
  await page
    .getByLabel('Email', { exact: true })
    .fill(`retry-${randomUUID()}@example.com`);
  await page.route('**/auth/v1/recover*', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ msg: 'rate limit' }),
    }),
  );
  await page
    .getByRole('button', { name: 'Gửi email khôi phục', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'quá nhiều yêu cầu' }),
  ).toBeVisible();
  await page.unroute('**/auth/v1/recover*');
  // A real used verification token yields Supabase's expired-link callback.
  const email = `used-${randomUUID()}@example.com`,
    a = client();
  await a.auth.signUp({ email, password: password() });
  await a.auth.resetPasswordForEmail(email, {
    redirectTo: 'http://127.0.0.1:5174/?auth=recovery',
  });
  await expect.poll(() => mailbox(email).length).toBeGreaterThan(0);
  const link = emailLink(email);
  await fetch(link, { redirect: 'manual' });
  const reused = await fetch(link, { redirect: 'manual' });
  const redirect = reused.headers.get('location');
  expect(!!redirect).toBe(true);
  await page.goto(redirect!);
  await expect(
    page.getByRole('heading', {
      name: 'Liên kết khôi phục không hợp lệ',
      exact: true,
    }),
  ).toBeVisible();
  await a.auth.signOut();
});

test('PKCE recovery callback exchanges its one-use code, including a reload of the form', async ({
  page,
}) => {
  const email = `pkce-${randomUUID()}@example.com`,
    a = client();
  await a.auth.signUp({ email, password: password() });
  const storage = new Map<string, string>();
  const pkce = createClient(cfg.url, cfg.key, {
    auth: {
      flowType: 'pkce',
      storageKey: 'lbd-supabase-auth',
      autoRefreshToken: false,
      storage: {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => {
          storage.set(k, v);
        },
        removeItem: (k) => {
          storage.delete(k);
        },
      },
    },
  });
  expect(
    (
      await pkce.auth.resetPasswordForEmail(email, {
        redirectTo: 'http://127.0.0.1:5174/?auth=recovery',
      })
    ).error === null,
  ).toBe(true);
  await expect.poll(() => mailbox(email).length).toBeGreaterThan(0);
  const result = await fetch(emailLink(email), { redirect: 'manual' });
  const callback = result.headers.get('location');
  expect(!!callback && new URL(callback!).searchParams.has('code')).toBe(true);
  await page.goto('/?auth=recovery');
  await page.evaluate(
    (entries) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    [...storage.entries()],
  );
  await page.goto('about:blank');
  await page.goto(callback!);
  await expect(
    page.getByRole('heading', { name: 'Đặt mật khẩu mới', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => location.search.includes('code='))).toBe(
    false,
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Đặt mật khẩu mới', exact: true }),
  ).toBeVisible();
  const pass = password();
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(pass);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Đổi mật khẩu thành công', exact: true }),
  ).toBeVisible();
  expect(
    (await client().auth.signInWithPassword({ email, password: pass }))
      .error === null,
  ).toBe(true);
  await a.auth.signOut();
});

test('old implicit links without a recovery query marker work; an expired session cannot update a password', async ({
  page,
}) => {
  const email = `old-link-${randomUUID()}@example.com`,
    a = client();
  await a.auth.signUp({ email, password: password() });
  await a.auth.resetPasswordForEmail(email, {
    redirectTo: 'http://127.0.0.1:5174/',
  });
  await expect.poll(() => mailbox(email).length).toBeGreaterThan(0);
  const response = await fetch(emailLink(email), { redirect: 'manual' });
  const callback = response.headers.get('location');
  expect(!!callback).toBe(true);
  await page.goto(callback!);
  await expect(
    page.getByRole('heading', { name: 'Đặt mật khẩu mới', exact: true }),
  ).toBeVisible();
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error_code: 'session_not_found',
        msg: 'expired test session',
      }),
    }),
  );
  const pass = password();
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(pass);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Lưu mật khẩu', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Liên kết khôi phục không hợp lệ',
      exact: true,
    }),
  ).toBeVisible();
  await a.auth.signOut();
});
