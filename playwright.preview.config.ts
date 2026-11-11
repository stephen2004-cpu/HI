import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Core UI smoke tests use only the public UI/storage contract. The complete dev
// suite also has a source-module fixture for simulating an incoming tombstone.
export default defineConfig({
  ...base,
  testMatch: ['**/app.spec.ts', '**/interface.spec.ts', '**/tasks.spec.ts'],
  outputDir: './test-results-preview',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5175' },
  webServer: {
    command: 'npm run preview -- --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  },
});
