import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  // CI starts `frontend/server.cjs` itself (it serves both `web/` and the
  // `/mobile` SPA routes, which a plain static server cannot), so Playwright
  // must not try to claim port 3000 a second time. `reuseExistingServer` is
  // true unconditionally; when nothing is listening Playwright still boots the
  // server below, so local `npx playwright test` keeps working unchanged.
  webServer: {
    command: 'node frontend/server.cjs',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});