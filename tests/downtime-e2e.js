const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.UI_BASE || 'http://localhost:5001';
const ADMIN = { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD };
const USER = { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD };

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

async function apiReq(method, path, user, body) {
  const headers = {};
  if (user) {
    headers['x-user-id'] = String(user.id || user._id);
    headers['x-user-email'] = user.email;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  assert.ok(ADMIN.email && ADMIN.password && USER.email && USER.password, 'TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD are required');
  const adminLogin = await apiReq('POST', '/api/auth/login', null, ADMIN);
  const admin = adminLogin.data.user;
  const userLogin = await apiReq('POST', '/api/auth/login', null, USER);
  const user = userLogin.data.user;
  assert.ok(admin && admin.id && user && user.id);

  const createdDowntimeIds = [];

  async function cleanup() {
    await apiReq('PUT', '/api/downtime', admin, { enabled: false });
    const list = await apiReq('GET', '/api/downtime', admin);
    if (list.status !== 200) return;
    for (const item of list.data.downtimes) {
      if (createdDowntimeIds.includes(String(item._id))) {
        if (item.status === 'active') await apiReq('POST', `/api/downtime/${item._id}/stop`, admin);
        if (item.status === 'scheduled') await apiReq('POST', `/api/downtime/${item._id}/cancel`, admin);
        await apiReq('DELETE', `/api/downtime/${item._id}`, admin);
      }
    }
  }

  await cleanup();
  const browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const adminPage = await adminContext.newPage();
  const userContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const userPage = await userContext.newPage();
  let createdRecordId = null;

  try {
    await test('admin can open the downtime workspace', async () => {
      await login(adminPage, ADMIN);
      await adminPage.getByRole('heading', { name: 'Admin Dashboard' }).waitFor({ timeout: 15000 });
      await adminPage.getByRole('button', { name: 'Downtime', exact: true }).click();
      await adminPage.getByRole('heading', { name: 'Maintenance & Downtime' }).waitFor({ timeout: 15000 });
      await adminPage.getByRole('button', { name: 'Schedule maintenance' }).waitFor({ timeout: 15000 });
    });

    await test('admin can schedule, edit, and cancel a future window with the compact form', async () => {
      await adminPage.getByRole('button', { name: 'Schedule maintenance' }).click();
      const modal = adminPage.locator('.modal');
      await modal.locator('#downtime-title').fill('E2E scheduled window');
      await modal.getByRole('button', { name: 'Schedule maintenance' }).click();
      await adminPage.getByText('Maintenance scheduled').first().waitFor({ timeout: 15000 });
      await adminPage.getByText('E2E scheduled window').first().waitFor({ timeout: 15000 });
      await adminPage.getByText('Next maintenance window is scheduled').waitFor({ timeout: 15000 });
      await adminPage.getByText(/Starts in/).first().waitFor({ timeout: 15000 });

      const listAfterCreate = await apiReq('GET', '/api/downtime', admin);
      const created = listAfterCreate.data.downtimes.find(d => d.title === 'E2E scheduled window');
      assert.ok(created);
      createdDowntimeIds.push(String(created._id));
      assert.equal(created.status, 'scheduled');

      const row = adminPage.locator('tr', { hasText: 'E2E scheduled window' });
      await row.getByRole('button', { name: /Manage/ }).click();
      await row.getByRole('menuitem', { name: /Edit & reschedule/ }).click();

      const editModal = adminPage.locator('.modal');
      await editModal.locator('#downtime-title').fill('E2E rescheduled window');
      await editModal.getByRole('button', { name: 'Save changes' }).click();
      await adminPage.getByText('Maintenance window updated').first().waitFor({ timeout: 15000 });
      await adminPage.getByText('E2E rescheduled window').first().waitFor({ timeout: 15000 });

      const editedRow = adminPage.locator('tr', { hasText: 'E2E rescheduled window' });
      await editedRow.getByRole('button', { name: /Manage/ }).click();
      await editedRow.getByRole('menuitem', { name: /Cancel window/ }).click();
      await adminPage.locator('.modal').getByRole('button', { name: 'Cancel window' }).click();
      await adminPage.getByText('Scheduled maintenance cancelled').first().waitFor({ timeout: 15000 });
      await adminPage.getByText('E2E rescheduled window').first().waitFor({ timeout: 15000 });
      const badge = adminPage.locator('tr', { hasText: 'E2E rescheduled window' }).locator('.badge');
      await badge.getByText('Cancelled').waitFor({ timeout: 15000 });
    });

    await test('admin can start maintenance immediately from the schedule form', async () => {
      await adminPage.getByRole('button', { name: 'Schedule maintenance' }).click();
      const modal = adminPage.locator('.modal');
      await modal.locator('#downtime-title').fill('E2E instant window');
      await modal.locator('.downtime-checkbox input').check();
      await modal.getByRole('button', { name: 'Start maintenance' }).click();
      await adminPage.getByText('Maintenance started').first().waitFor({ timeout: 15000 });
      await adminPage.getByText('New gift card submissions are paused').waitFor({ timeout: 15000 });
      await adminPage.locator('.downtime-control-card-active').waitFor({ timeout: 15000 });
      await adminPage.getByRole('button', { name: 'End maintenance now' }).waitFor({ timeout: 15000 });

      const list = await apiReq('GET', '/api/downtime', admin);
      const active = list.data.downtimes.find(d => d.status === 'active');
      assert.ok(active);
      createdDowntimeIds.push(String(active._id));
    });

    await test('user can log in and see maintenance while viewing existing records', async () => {
      await login(userPage, USER);
      await userPage.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });
      const ribbon = userPage.locator('.downtime-ribbon-live').first();
      await ribbon.waitFor({ timeout: 15000 });
      const ribbonText = await ribbon.innerText();
      assert.ok(ribbonText.includes('Maintenance mode is on'));
      assert.ok(ribbonText.includes('view existing records'));
      await userPage.getByRole('heading', { name: 'My Gift Cards' }).waitFor({ timeout: 15000 });
      assert.ok(await userPage.getByText('SHR-TEST-1').count() >= 1, 'existing records should remain visible');
      const addButton = userPage.getByRole('button', { name: 'Maintenance mode' });
      assert.equal(await addButton.isDisabled(), true);
    });

    await test('backend blocks new record creation with a direct API request during maintenance', async () => {
      const r = await apiReq('POST', '/api/gc-records', user, {
        giftCard: 'E2E-BLOCKED-' + Date.now(),
        giftCardPin: '9999',
        giftCardAmount: 100,
        paid: 80,
        provider: 'Flipkart'
      });
      assert.equal(r.status, 503);
      assert.equal(r.data.code, 'DOWNTIME_ACTIVE');
    });

    await test('admin can end maintenance from the primary action', async () => {
      await adminPage.getByRole('button', { name: 'End maintenance now' }).click();
      await adminPage.locator('.modal').getByRole('button', { name: 'End maintenance' }).click();
      await adminPage.getByText('Maintenance ended').first().waitFor({ timeout: 15000 });
      await adminPage.getByText('Application is live').waitFor({ timeout: 15000 });
      await adminPage.locator('.downtime-control-card-active').waitFor({ state: 'detached', timeout: 15000 });
    });

    await test('user sees the banner clear and can create a new record after maintenance ends', async () => {
      await userPage.reload({ waitUntil: 'networkidle' });
      await userPage.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });
      assert.equal(await userPage.locator('.downtime-ribbon-live').count(), 0);
      const addButton = userPage.getByRole('button', { name: '+ Add Record' });
      assert.equal(await addButton.isEnabled(), true);
      await addButton.click();

      const modal = userPage.locator('.modal');
      const card = 'E2E-ALLOWED-' + Date.now();
      await modal.locator('input[type="text"]').nth(0).fill(card);
      await modal.locator('input[type="text"]').nth(1).fill('2468');
      await modal.locator('input[type="number"]').nth(0).fill('300');
      await modal.locator('input[type="number"]').nth(1).fill('250');
      await modal.getByRole('button', { name: 'Create' }).click();
      await userPage.getByText('Record created').first().waitFor({ timeout: 15000 });
      await userPage.getByText(card).first().waitFor({ timeout: 15000 });

      const list = await apiReq('GET', '/api/gc-records?search=' + encodeURIComponent(card), user);
      const created = list.data.records.find(r => r.giftCard === card);
      assert.ok(created);
      createdRecordId = created._id;
    });

    await test('mobile layout keeps the maintenance banner and disabled create control usable', async () => {
      const toggle = await apiReq('PUT', '/api/downtime', admin, { enabled: true, title: 'E2E mobile maintenance' });
      assert.equal(toggle.status, 200);
      if (toggle.data.current?._id) createdDowntimeIds.push(String(toggle.data.current._id));
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobilePage = await mobileContext.newPage();
      await login(mobilePage, USER);
      await mobilePage.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });
      const ribbon = mobilePage.locator('.downtime-ribbon-live').first();
      await ribbon.waitFor({ timeout: 15000 });
      assert.ok((await ribbon.boundingBox()).width <= 390);
      const addButton = mobilePage.getByRole('button', { name: 'Maintenance mode' });
      assert.equal(await addButton.isDisabled(), true);
      await mobileContext.close();
      await apiReq('PUT', '/api/downtime', admin, { enabled: false });
    });
  } finally {
    if (createdRecordId) await apiReq('DELETE', `/api/gc-records/${createdRecordId}`, admin);
    await cleanup();
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`\n${f.name}\n${f.err.stack}`);
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
