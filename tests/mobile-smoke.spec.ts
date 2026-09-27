/**
 * Mobile view smoke test — verifies the mobile/ pages render without console
 * errors, use the phone chrome (app bar + bottom tabs) and that the "More"
 * bottom sheet opens. Run with: npx playwright test mobile-smoke.spec.ts
 */
import { test, expect, devices } from '@playwright/test';

const BASE = process.env.MOBILE_BASE_URL || 'http://localhost:3999';

// h1 text appears in the active UI language (default: Bangla).
const PAGES = [
  { file: 'index.html', heading: /প্রতিটি মাঠের জন্য স্মার্ট সিদ্ধান্ত|Smarter decisions/i },
  { file: 'dashboard.html', heading: /শুভ সকাল|Good morning/i },
  { file: 'soil.html', heading: /মাটি ইন্টেলিজেন্স|Soil Intelligence/i },
  { file: 'market.html', heading: /বাজার ইন্টেলিজেন্স|Market Intelligence/i },
  { file: 'ai-search.html', heading: /AI কৃষি সহকারী|AI Farming Assistant/i },
];

// API calls fail in a plain static server (no Worker). Those 404s are expected
// and are exercised by the page controllers' own error states.
const IGNORED_ERRORS = ['favicon', '/api/', 'Failed to load resource'];

test.use({ ...devices['iPhone 13'] });

for (const page of PAGES) {
  test(`${page.file} renders on a phone viewport`, async ({ page: pw }) => {
    const errors: string[] = [];
    pw.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    pw.on('pageerror', (err) => errors.push(err.message));

    await pw.goto(`${BASE}/${page.file}`, { waitUntil: 'domcontentloaded' });
    await expect(pw.locator('.m-appbar')).toBeVisible();
    await expect(pw.locator('.m-tabbar')).toBeVisible();
    await expect(pw.locator('.m-tab')).toHaveCount(5);
    await expect(pw.locator('h1').first()).toContainText(page.heading);

    // Icons must have been replaced with inline SVG.
    await expect(pw.locator('.m-tabbar .icon').first()).toBeVisible();

    // No horizontal overflow at the iPhone 13 width (390px).
    const overflow = await pw.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // No uncaught JS errors (network 404s to the API are tolerated).
    const realErrors = errors.filter((e) => !IGNORED_ERRORS.some((ig) => e.includes(ig)));
    expect(realErrors).toEqual([]);
  });
}

test('More bottom sheet opens and closes', async ({ page: pw }) => {
  await pw.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await pw.locator('[data-open-more]').click();
  await expect(pw.locator('#mobileMoreSheet')).toBeVisible();
  await expect(pw.locator('.m-more-item')).toHaveCount(6);
  await pw.locator('#mobileMoreSheet .icon-btn').click();
  await expect(pw.locator('#mobileMoreSheet')).toBeHidden();
});

test('active tab follows the current page', async ({ page: pw }) => {
  // Server redirects /soil.html -> /soil, so test the canonical URL
  await pw.goto(`${BASE}/soil`, { waitUntil: 'networkidle' });
  const active = pw.locator('.m-tab.active');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('href', 'soil.html');
});

test('market table rows get data-labels for the card layout', async ({ page: pw }) => {
  await pw.goto(`${BASE}/market.html`, { waitUntil: 'domcontentloaded' });
  // Seed a row the way market.js does (no API needed) and confirm the mobile
  // shell decorates cells with header labels for the stacked-card layout.
  await pw.evaluate(() => {
    const tbody = document.querySelector('#watchlistBody');
    tbody.innerHTML = '<tr><td>Rice</td><td>৳ 32.50</td><td>Today</td><td><button class="btn btn-soft btn-tiny">×</button></td></tr>';
  });
  const cells = pw.locator('#watchlistBody td[data-label]');
  await expect(cells).toHaveCount(3);
  await expect(cells.first()).toHaveAttribute('data-label', /Commodity|পণ্য/);
  await expect(pw.locator('#watchlistBody td[data-label]').nth(1)).toHaveAttribute('data-label', /Price|দাম/);
});


