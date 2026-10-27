import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(
  readFileSync(
    process.env.LBD_SUPABASE_TEST_CONFIG ?? '/tmp/lbd-auth-stack/public.json',
    'utf8',
  ),
);
if (!['127.0.0.1', 'localhost'].includes(new URL(cfg.url).hostname))
  throw Error(
    'Live auth tests are restricted to the isolated local test backend.',
  );
export default defineConfig({
  testDir: './integration',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: cfg.url, VITE_SUPABASE_PUBLISHABLE_KEY: cfg.key },
  },
});
