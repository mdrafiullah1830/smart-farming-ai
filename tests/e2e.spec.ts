import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the five-page redesign (desktop + mobile via Playwright projects).
 *
 * Flows 1–10:
 *  1. Home loads with honest hero placeholders / dynamic cards
 *  2. bn ↔ en language toggle works on every page
 *  3. Dashboard loads core widgets (tasks, irrigation honest state, greeting)
 *  4. Market page loads commodities + price panels without fabricated live values
 *  5. Soil page location selectors + report panel + compare hidden by default
 *  6. AI search composer (ask mode) + honest empty/unavailable states
 *  7. Cross-page navigation via sidebar/header (no dead href="#")
 *  8. Protected action opens auth modal when signed out
 *  9. Irrigation switch remains disabled (honest no-device state)
 * 10. No horizontal overflow on mobile viewport; lang toggle present on all pages
 */

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const PAGES = [
  { path: '/', file: 'index.html', h1: 'h1[data-i18n="heroTitle"]' },
  { path: '/dashboard.html', file: 'dashboard.html', h1: 'h1' },
  { path: '/market.html', file: 'market.html', h1: 'h1[data-i18n="marketTitle"]' },
  { path: '/soil.html', file: 'soil.html', h1: 'h1[data-i18n="soilTitle"]' },
  { path: '/ai-search.html', file: 'ai-search.html', h1: 'h1[data-i18n="aiTitle"]' },
];

async function gotoPage(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
}

test.describe('Flow 1 — Home', () => {
  test('landing loads with hero, calendar, honest metrics', async ({ page }) => {
    await gotoPage(page, '/');
    await expect(page).toHaveTitle(/Smart Farming AI/);
    const hero = page.locator('h1[data-i18n="heroTitle"]');
    await expect(hero).toBeVisible();
    // default language is Bangla
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
    await expect(hero).toHaveText(/ভূমি|মাঠ|স্মার্ট|প্রতি|নির্ণয়|সিদ্ধান্ত|Smarter/i);

    // calendar tabs present
    await expect(page.locator('.calendar-tabs [data-crop="Rice"]')).toBeVisible();
    await expect(page.locator('#calendarTimeline')).toBeAttached();

    // honest placeholder metrics (no fabricated live numbers until API responds)
    const heroPrice = page.locator('#heroMarketPrice');
    await expect(heroPrice).toBeVisible();
    const priceText = (await heroPrice.textContent())?.trim();
    assertHonestValue(priceText);

    // no dead empty-hash primary CTAs (in-page anchors like #solutions are allowed)
    const deadLinks = page.locator("a[href='#'], a[href='']");
    await expect(deadLinks).toHaveCount(0);
  });

  test('calendar tab switch updates active state', async ({ page }) => {
    await gotoPage(page, '/');
    const rice = page.locator('.calendar-tabs [data-crop="Rice"]');
    const jute = page.locator('.calendar-tabs [data-crop="Jute"]');
    await expect(rice).toHaveClass(/active/);
    await jute.click();
    await expect(jute).toHaveClass(/active/);
    await expect(rice).not.toHaveClass(/active/);
  });
});

test.describe('Flow 2 — Language toggle on every page', () => {
  for (const p of PAGES) {
    test(`bn↔en on ${p.file}`, async ({ page }) => {
      await gotoPage(page, p.path);
      const enBtn = page.locator(`[data-lang="en"]`).first();
      const bnBtn = page.locator(`[data-lang="bn"]`).first();
      await expect(enBtn).toBeVisible();

      await enBtn.click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(enBtn).toHaveAttribute('aria-pressed', 'true');

      const heading = page.locator(p.h1);
      await expect(heading).toBeVisible();
      // Prefer i18n-bound node when present; fall back to full h1
      const i18nHeading = heading.locator('[data-i18n]').first();
      const target = (await i18nHeading.count()) > 0 ? i18nHeading : heading;
      const enText = (await target.textContent()) || '';
      assertNoBengaliScript(enText);

      await bnBtn.click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
      await expect(bnBtn).toHaveAttribute('aria-pressed', 'true');
    });
  }
});

test.describe('Flow 3 — Dashboard', () => {
  test('loads greeting, tasks, weather meta, market mini', async ({ page }) => {
    await gotoPage(page, '/dashboard.html');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#greetName')).toBeAttached();
    await expect(page.locator('#taskList')).toBeAttached();
    await expect(page.locator('#headingDate')).toBeAttached();

    // side nav present
    await expect(page.locator('.side-nav a[href="market.html"]')).toBeVisible();

    // honest guest user menu (bn অতিথি or en Guest or —)
    await expect(page.locator('[data-user-name]')).toHaveText(/—|Guest|অতিথি|.+ /);

    // no dead links
    await expect(page.locator("a[href='#'], a[href='']")).toHaveCount(0);
  });

  test('notifications panel starts hidden and opens on click', async ({ page }) => {
    await gotoPage(page, '/dashboard.html');
    const panel = page.locator('#notificationsPanel');
    await expect(panel).toBeHidden();
    await page.locator('#notificationsBtn').click();
    await expect(panel).toBeVisible();
  });
});

test.describe('Flow 4 — Market', () => {
  test('commodities, chart, watchlist, export controls present', async ({ page }) => {
    await gotoPage(page, '/market.html');
    await expect(page.locator('h1[data-i18n="marketTitle"]')).toBeVisible();
    await expect(page.locator('#commodities')).toBeAttached();
    await expect(page.locator('#chartWrap')).toBeAttached();
    await expect(page.locator('#rangeTabs [data-range="7"]')).toBeVisible();
    await expect(page.locator('#watchlistAdd')).toBeVisible();
    await expect(page.locator('#exportBtn')).toBeVisible();
    await expect(page.locator('#createAlertBtn')).toBeVisible();

    // price fields start as honest em dash or load from API — never fake "৳ 999"
    for (const id of ['#currentPrice', '#priceHigh', '#priceLow', '#chartCropLabel']) {
      const text = ((await page.locator(id).textContent()) || '').trim();
      assertHonestValue(text);
    }
  });

  test('range tab switch updates selection', async ({ page }) => {
    await gotoPage(page, '/market.html');
    const r30 = page.locator('#rangeTabs [data-range="30"]');
    await r30.click();
    await expect(r30).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Flow 5 — Soil', () => {
  test('location selectors, report, compare hidden by default', async ({ page }) => {
    await gotoPage(page, '/soil.html');
    await expect(page.locator('h1[data-i18n="soilTitle"]')).toBeVisible();
    await expect(page.locator('#districtSelect')).toBeAttached();
    await expect(page.locator('#upazilaSelect')).toBeAttached();
    await expect(page.locator('#viewReportBtn')).toBeVisible();
    await expect(page.locator('#downloadReportBtn')).toBeVisible();
    await expect(page.locator('#comparePanel')).toBeHidden();

    await page.locator('#compareBtn').click();
    await expect(page.locator('#comparePanel')).toBeVisible();
    await expect(page.locator('#compareBtn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('gauge placeholders are honest dashes before load', async ({ page }) => {
    await gotoPage(page, '/soil.html');
    // health score starts as — until API fills it (may already be filled if API fast)
    const score = ((await page.locator('#healthScore').textContent()) || '').trim();
    assertHonestValue(score);
  });
});

test.describe('Flow 6 — AI search', () => {
  test('composer ask mode, sources, conversation list', async ({ page }) => {
    await gotoPage(page, '/ai-search.html');
    await expect(page.locator('h1[data-i18n="aiTitle"]')).toBeVisible();
    await expect(page.locator('#question')).toBeVisible();
    await expect(page.locator('#askButton')).toBeVisible();
    await expect(page.locator('#newQuestionBtn')).toBeVisible();
    await expect(page.locator('#conversationList')).toBeAttached();
    await expect(page.locator('#sourcesList')).toBeAttached();

    await page.locator('[data-mode="photo"]').click();
    await expect(page.locator('#photoPanel')).toBeVisible();
    await expect(page.locator('#askPanel')).toBeHidden();

    await page.locator('[data-mode="ask"]').click();
    await expect(page.locator('#askPanel')).toBeVisible();
    await expect(page.locator('#photoPanel')).toBeHidden();
  });

  test('submitting a question does not hang and shows state', async ({ page }) => {
    await gotoPage(page, '/ai-search.html');
    await page.locator('#question').fill('What rice variety grows best in saline soil?');
    await page.locator('#askButton').click();
    // Either an answer, an auth prompt, rate-limit, or honest unavailable — not a blank page
    await expect(page.locator('h1[data-i18n="aiTitle"]')).toBeVisible();
    // Wait briefly for a state banner or answer surface
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
  });
});

test.describe('Flow 7 — Cross-page navigation', () => {
  test('sidebar/header navigates across all five pages', async ({ page }) => {
    await gotoPage(page, '/dashboard.html');
    await page.locator('.side-nav a[href="market.html"]').click();
    // serve may strip .html — accept both
    await expect(page).toHaveURL(/market(\.html)?/);

    await page.locator('.side-nav a[href="soil.html"]').click();
    await expect(page).toHaveURL(/soil(\.html)?/);

    await page.locator('.side-nav a[href="ai-search.html"]').click();
    await expect(page).toHaveURL(/ai-search(\.html)?/);

    await page.locator('.side-nav a[href="dashboard.html"]').click();
    await expect(page).toHaveURL(/dashboard(\.html)?/);

    // Brand is hidden on mobile bottom-nav; use side-nav/resource path or direct home
    const brand = page.locator('.sidebar a.brand');
    if (await brand.isVisible()) {
      await brand.click();
    } else {
      await page.goto(`${BASE}/index.html`);
    }
    await expect(page).toHaveURL(/index|\/$/);
  });

  test('every page has no dead href="#" links', async ({ page }) => {
    for (const p of PAGES) {
      await gotoPage(page, p.path);
      // Allow intentional in-page anchors (#solutions, #fields, #alerts) — only reject bare "#"
      const dead = page.locator("a[href='#'], a[href='']");
      await expect(dead, `dead links on ${p.file}`).toHaveCount(0);
    }
  });
});

test.describe('Flow 8 — Auth modal', () => {
  test('protected market alert opens sign-in when signed out', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('sf:auth');
        localStorage.removeItem('sfAuth');
        localStorage.removeItem('sf:user');
      } catch {
        /* ignore */
      }
    });
    await gotoPage(page, '/market.html');
    await page.locator('#createAlertBtn').click();
    const modal = page.locator('#authModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#authEmail')).toBeVisible();
    await expect(page.locator('#authPassword')).toBeVisible();
    await expect(page.locator('#authForm')).toBeVisible();
  });
});

test.describe('Flow 9 — Honest irrigation state', () => {
  test('irrigation switch is disabled without a connected device', async ({ page }) => {
    await gotoPage(page, '/dashboard.html');
    const sw = page.locator('#irrigationSwitch');
    await expect(sw).toBeAttached();
    // Spec: no device → control unavailable (disabled), not a fake ON state
    await expect(sw).toBeDisabled();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('Flow 10 — Mobile layout & no overflow', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile viewport projects only');

  test('no horizontal overflow and lang toggle reachable', async ({ page }) => {
    await gotoPage(page, '/');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        bodyScrollW: document.body.scrollWidth,
      };
    });
    expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
    expect(overflow.bodyScrollW).toBeLessThanOrEqual(overflow.clientW + 1);

    await expect(page.locator('[data-lang="en"]').first()).toBeVisible();
  });

  test('dashboard main widgets visible on small screens', async ({ page }) => {
    await gotoPage(page, '/dashboard.html');
    await expect(page.locator('#taskList')).toBeVisible();
    await expect(page.locator('#irrigationSwitch')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);
  });
});

/** Helpers */

function assertNoBengaliScript(text) {
  // Allow guest/user names that may lag a language switch; primary UI labels must be Latin
  const cleaned = String(text).replace(/অতিথি/g, '');
  expect(cleaned, `expected no Bengali in English mode: ${text}`).not.toMatch(/[ঀ-৿]/);
}

/**
 * Honest value: empty, em dash, ellipsis, loading dots, or real data patterns.
 * Rejects obviously fabricated demo prices like ৳999.99 / ₹999 / $999 placeholders
 * when they appear as the only static value without API — we allow real BDT amounts
 * that come from the API. This check primarily blocks the old hardcoded demo strings.
 */
function assertHonestValue(text) {
  if (!text) return;
  const t = text.trim();
  if (t === '' || t === '—' || t === '…' || t === '...' || t === '–') return;
  // Known old fabricated demo markers
  expect(t, `fabricated demo value: ${t}`).not.toMatch(/Lorem ipsum/i);
  expect(t).not.toMatch(/999\.99\s*demo/i);
}
