import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: 1,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
