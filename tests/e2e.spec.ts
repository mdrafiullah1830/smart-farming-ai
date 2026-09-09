import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('Smart Farming AI - Frontend E2E', () => {
  test('landing page loads with hero heading (default Bangla)', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('h1')).toContainText('স্মার্ট ফার্মিং');
    await expect(page).toHaveTitle(/Smart Farming AI/);
  });

  test('language toggle switches hero to English', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#langBtnEn');
    await expect(page.locator('h1')).toContainText('Smart Farming');
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('#aiSearchBox')).toBeVisible();
    await expect(page.locator('h1[data-i18n="appTitle"]')).toBeVisible();
  });

  test('market page loads with district selector', async ({ page }) => {
    await page.goto(`${BASE_URL}/market.html`);
    await expect(page).toHaveURL(/.*\/market/);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('soil analysis page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/soil.html`);
    await expect(page).toHaveURL(/.*\/soil/);
    await expect(page.locator('#locationSection')).toBeVisible();
    await expect(page.locator('#locationBtn')).toBeVisible();
  });

  test('AI search page loads with search box', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-search.html`);
    await expect(page).toHaveURL(/.*\/ai-search/);
    await expect(page.locator('#searchInput')).toBeVisible();
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

  test('districts endpoint returns the expected districts', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/districts`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.districts.length).toBeGreaterThanOrEqual(63);
  });
});
