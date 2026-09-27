/** Capture mobile screenshots for visual review. */
import { test, devices } from '@playwright/test';

const BASE = process.env.MOBILE_BASE_URL || 'http://localhost:3999';
const PAGES = ['index.html', 'dashboard.html', 'soil.html', 'market.html', 'ai-search.html'];

test.use({ ...devices['iPhone 13'] });

for (const file of PAGES) {
  test(`screenshot ${file}`, async ({ page }) => {
    await page.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    // Viewport-only captures keep the files small enough to review inline.
    await page.screenshot({ path: `test-results/mobile-view-${file.replace('.html', '')}.png` });
  });
}

