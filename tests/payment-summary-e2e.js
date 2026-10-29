const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.UI_BASE || 'http://localhost:5001';
const USER = { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD };
const ADMIN = { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD };

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

async function login(page, creds) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Enter your email').fill(creds.email);
  await page.getByPlaceholder('Enter your password').fill(creds.password);
  await Promise.all([
    page.waitForURL(/\/(admin|user)$/, { timeout: 15000 }),
    page.getByRole('button', { name: 'Sign In' }).click()
  ]);
  await page.waitForLoadState('networkidle');
}

(async () => {
  assert.ok(USER.email && USER.password && ADMIN.email && ADMIN.password, 'TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are required');

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();

  try {
    await login(page, USER);
    await page.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });

    await test('user dashboard shows the payment summary with recorded totals', async () => {
      await page.getByRole('heading', { name: 'Payment Summary' }).waitFor({ timeout: 15000 });
      const summary = page.locator('.payment-summary');
      await summary.getByText(/All time:/).waitFor({ timeout: 15000 });
      assert.equal(await summary.locator('.payment-kpi').count(), 4);
      assert.ok((await summary.locator('.payment-summary-alltime').innerText()).includes('paid-back record'));
    });

    await test('daily payment groups expand to show individual records and amounts', async () => {
      const summary = page.locator('.payment-summary');
      const firstGroup = summary.locator('.payment-group-header').first();
      await firstGroup.waitFor({ timeout: 15000 });
      const groupCount = await summary.locator('.payment-group').count();
      assert.ok(groupCount >= 1, 'seeded paid-back records should produce at least one date group');
      const expanded = await firstGroup.getAttribute('aria-expanded');
      if (expanded !== 'true') await firstGroup.click();
      await summary.locator('.payment-group-body .payment-record-row').first().waitFor({ timeout: 15000 });
      const groupText = await firstGroup.innerText();
      assert.ok(/record/.test(groupText));
      assert.ok(/₹/.test(groupText));
    });

    await test('payment search filters groups and updates the in-view counts', async () => {
      const summary = page.locator('.payment-summary');
      const response = page.waitForResponse(resp => resp.url().includes('/api/stats/user/payments') && resp.url().includes('search='), { timeout: 15000 });
      await summary.getByLabel('Search payments').fill('SHR-TEST-6');
      await response;
      await page.waitForFunction(() => {
        const value = document.querySelector('.payment-kpi .payment-kpi-value');
        return value && value.textContent.trim() === '1';
      }, null, { timeout: 15000 });
      const groupText = await summary.locator('.payment-group').first().innerText();
      assert.ok(groupText.includes('SHR-TEST-6') || (await summary.locator('.payment-group-body').first().innerText()).includes('SHR-TEST-6'));
    });

    await test('daily, weekly, and monthly trend summaries render', async () => {
      const summary = page.locator('.payment-summary');
      await summary.getByRole('button', { name: 'Clear' }).click();
      await summary.locator('.payment-chart-column').first().waitFor({ timeout: 15000 });
      await summary.getByRole('button', { name: 'Weekly', exact: true }).click();
      await summary.locator('.payment-chart-column').first().waitFor({ timeout: 15000 });
      await summary.getByRole('button', { name: 'Monthly', exact: true }).click();
      await summary.locator('.payment-chart-column').first().waitFor({ timeout: 15000 });
      await summary.getByRole('button', { name: 'Daily', exact: true }).click();
    });

    await test('pending payments are clearly separated from recorded payments', async () => {
      const summary = page.locator('.payment-summary');
      const pending = summary.locator('.payment-pending-panel');
      await pending.waitFor({ timeout: 15000 });
      const text = await pending.innerText();
      assert.ok(text.includes('Not yet recorded as paid back'));
      assert.ok(text.includes('No future payment dates are estimated'));
    });

    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();

    await test('mobile payment summary stays within the viewport and keeps groups usable', async () => {
      await login(mobilePage, USER);
      await mobilePage.getByRole('heading', { name: 'Payment Summary' }).waitFor({ timeout: 15000 });
      const summary = mobilePage.locator('.payment-summary');
      const group = summary.locator('.payment-group-header').first();
      await group.waitFor({ timeout: 15000 });
      const box = await group.boundingBox();
      assert.ok(box.width <= 390, `group width ${box.width} should fit a 390px viewport`);
      if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
      await summary.locator('.payment-group-body .payment-record-row').first().waitFor({ timeout: 15000 });
      const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `page should not overflow horizontally (overflow ${overflow}px)`);
      await mobile.close();
    });

    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const adminPage = await adminContext.newPage();
    await test('admin dashboard remains available and unchanged', async () => {
      await login(adminPage, ADMIN);
      await adminPage.getByRole('heading', { name: 'Admin Dashboard' }).waitFor({ timeout: 15000 });
      await adminPage.getByText('Total Records').first().waitFor({ timeout: 15000 });
      assert.equal(await adminPage.getByRole('heading', { name: 'Payment Summary' }).count(), 0);
      await adminContext.close();
    });
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
