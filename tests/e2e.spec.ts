import { test, expect } from '@playwright/test';

test.describe('Smart Farming AI - Frontend E2E', () => {
  const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('landing page loads with hero section', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Smart Farming AI');
    await expect(page.locator('text=বাংলাদেশ')).toBeVisible();
  });

  test('navigation to dashboard works', async ({ page }) => {
    await page.click('a[href="/dashboard.html"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*dashboard\.html/);
    await expect(page.locator('text=ড্যাশবোর্ড')).toBeVisible();
  });

  test('navigation to market page works', async ({ page }) => {
    await page.click('a[href="/market.html"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*market\.html/);
    await expect(page.locator('text=বাজার মূল্য')).toBeVisible();
  });

  test('navigation to soil page works', async ({ page }) => {
    await page.click('a[href="/soil.html"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*soil\.html/);
    await expect(page.locator('text=মাটি বিশ্লেষণ')).toBeVisible();
  });

  test('navigation to AI search page works', async ({ page }) => {
    await page.click('a[href="/ai-search.html"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*ai-search\.html/);
    await expect(page.locator('text=AI সার্চ')).toBeVisible();
  });

  test('language toggle switches to English', async ({ page }) => {
    await page.click('button:has-text("EN")');
    await expect(page.locator('text=Smart Farming AI')).toBeVisible();
  });

  test('language toggle switches to Bangla', async ({ page }) => {
    await page.click('button:has-text("বাংলা")');
    await expect(page.locator('text=স্মার্ট ফার্মিং AI')).toBeVisible();
  });

  test('district dropdown loads on market page', async ({ page }) => {
    await page.goto(`${BASE_URL}/market.html`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('select#district')).toBeVisible();
  });

  test('weather widget loads on dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#weather-widget')).toBeVisible();
  });

  test('soil analysis form accepts coordinates', async ({ page }) => {
    await page.goto(`${BASE_URL}/soil.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="lat"]', '23.81');
    await page.fill('input[name="lng"]', '90.41');
    await page.click('button:has-text("বিশ্লেষণ করুন")');
    await expect(page.locator('.soil-result')).toBeVisible({ timeout: 10000 });
  });

  test('AI search accepts query and returns results', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-search.html`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="query"]', 'ধান কীভাবে চাষ করব');
    await page.click('button:has-text("সার্চ")');
    await expect(page.locator('.search-results')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('API Integration', () => {
  const API_BASE = process.env.E2E_API_BASE || 'http://localhost:8787';

  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('districts endpoint returns 63 districts', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/districts`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.districts.length).toBe(63);
  });

  test('weather endpoint returns forecast', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/weather?lat=23.81&lng=90.41`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.current).toBeDefined();
    expect(body.forecast).toBeDefined();
  });

  test('market prices endpoint returns prices', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/market/prices`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.prices).toBeDefined();
  });

  test('chat endpoint returns agricultural advice', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/chat`, {
      data: { message: 'ধানের রোগ', lang: 'bn' },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.reply).toBeDefined();
  });

  test('crop recommendation requires district', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/crop/recommend-dynamic`, {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test('rate limiting works', async ({ request }) => {
    // Make many requests quickly
    for (let i = 0; i < 65; i++) {
      await request.get(`${API_BASE}/api/v1/districts`);
    }
    // The 65th should be rate limited
    const response = await request.get(`${API_BASE}/api/v1/districts`);
    expect(response.status()).toBe(429);
  });
});