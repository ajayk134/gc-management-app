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

async function apiReq(method, path, admin) {
  const headers = {};
  if (admin) {
    headers['x-user-id'] = String(admin.id || admin._id);
    headers['x-user-email'] = admin.email;
  }
  let body;
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
    body = '{}';
  }
  const res = await fetch(BASE + path, { method, headers, body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const toLocalInput = (value) => {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

async function fillDowntimeWindow(scope, startValue, endValue) {
  const start = toLocalInput(startValue);
  const end = toLocalInput(endValue);
  await scope.locator('#downtime-start').fill(start.slice(0, 10));
  await scope.locator('#downtime-start-time').fill(start.slice(11, 16));
  await scope.locator('#downtime-end').fill(end.slice(0, 10));
  await scope.locator('#downtime-end-time').fill(end.slice(11, 16));
}

(async () => {
  assert.ok(ADMIN.email && ADMIN.password && USER.email && USER.password, 'TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD are required');
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN)
  });
  const admin = (await loginRes.json()).user;
  assert.ok(admin && admin.id);

  async function cleanup() {
    const list = await apiReq('GET', '/api/downtime', admin);
    if (list.status !== 200) return;
    for (const item of list.data.downtimes) {
      if (item.status === 'active') await apiReq('POST', `/api/downtime/${item._id}/stop`, admin);
      if (item.status === 'scheduled') await apiReq('POST', `/api/downtime/${item._id}/cancel`, admin);
    }
    const refreshed = await apiReq('GET', '/api/downtime', admin);
    for (const item of refreshed.data.downtimes) {
      if (['completed', 'cancelled'].includes(item.status)) {
        await apiReq('DELETE', `/api/downtime/${item._id}`, admin);
      }
    }
  }

  await cleanup();
  const title = 'E2E Maintenance ' + Date.now();
  const browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const adminPage = await adminContext.newPage();
  adminPage.on('dialog', dialog => dialog.accept());

  const userContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const userPage = await userContext.newPage();

  try {
    await test('admin can open the downtime tab and schedule maintenance through the UI', async () => {
      await login(adminPage, ADMIN);
      await adminPage.getByRole('heading', { name: 'Admin Dashboard' }).waitFor({ timeout: 15000 });
      await adminPage.getByRole('button', { name: 'Downtime', exact: true }).click();
      await adminPage.getByRole('heading', { name: 'Scheduled Downtime' }).waitFor({ timeout: 15000 });
      await adminPage.getByRole('button', { name: '+ Schedule Downtime' }).click();
      const modal = adminPage.locator('.modal');
      await modal.locator('input[type="text"]').fill(title);
      await modal.locator('textarea').fill('E2E maintenance message');
      await fillDowntimeWindow(modal, Date.now() + 60 * 60 * 1000, Date.now() + 2 * 60 * 60 * 1000);
      await modal.getByRole('button', { name: 'Schedule', exact: true }).click();
      await adminPage.getByText('Downtime scheduled').first().waitFor({ timeout: 15000 });
      await adminPage.getByRole('cell', { name: new RegExp(title) }).waitFor({ timeout: 15000 });
      await adminPage.locator('.downtime-summary-card').nth(1).getByText(/Ends/).waitFor({ timeout: 15000 });
    });

    await test('user sees the styled upcoming downtime ribbon with date and time', async () => {
      await login(userPage, USER);
      await userPage.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });
      const ribbon = userPage.locator('.downtime-ribbon').first();
      await ribbon.waitFor({ timeout: 15000 });
      assert.ok((await ribbon.innerText()).includes(title), 'ribbon must include downtime title');
      assert.ok((await ribbon.innerText()).includes('Scheduled maintenance'), 'ribbon must announce scheduled maintenance');
    });

    await test('admin can start the scheduled downtime immediately from the UI', async () => {
      await adminPage.reload({ waitUntil: 'networkidle' });
      await adminPage.getByRole('button', { name: 'Downtime', exact: true }).click();
      const row = adminPage.locator('tr', { hasText: title }).first();
      await row.waitFor({ timeout: 15000 });
      await row.getByRole('button', { name: 'Start now' }).click();
      const modal = adminPage.locator('.modal');
      await modal.getByRole('button', { name: 'Start now' }).click();
      await adminPage.getByText('Downtime started immediately').first().waitFor({ timeout: 15000 });
      await adminPage.getByRole('cell', { name: /Active/ }).first().waitFor({ timeout: 15000 });
      await adminPage.locator('.downtime-ribbon-live').waitFor({ timeout: 15000 });
    });

    await test('regular user is blocked with a clear downtime page during active maintenance', async () => {
      await userPage.reload({ waitUntil: 'networkidle' });
      await userPage.getByRole('heading', { name: /We’ll be back shortly|We'll be back shortly/ }).waitFor({ timeout: 15000 });
      assert.equal(await userPage.getByRole('heading', { name: 'My Dashboard' }).count(), 0);
      const bodyText = await userPage.locator('.downtime-page-card').innerText();
      assert.ok(bodyText.includes('Maintenance in progress'));
      assert.ok(bodyText.includes('E2E maintenance message'));
      await userPage.getByRole('button', { name: 'Check again' }).click();
    });

    await test('admin retains access to the admin panel while downtime is active', async () => {
      await adminPage.reload({ waitUntil: 'networkidle' });
      await adminPage.getByRole('heading', { name: 'Admin Dashboard' }).waitFor({ timeout: 15000 });
      await adminPage.getByRole('button', { name: 'Downtime', exact: true }).click();
      await adminPage.getByRole('heading', { name: 'Scheduled Downtime' }).waitFor({ timeout: 15000 });
      const row = adminPage.locator('tr', { hasText: title }).first();
      await row.getByRole('button', { name: 'Stop now' }).waitFor({ timeout: 15000 });
    });

    await test('admin can stop active downtime early and user access is restored', async () => {
      const row = adminPage.locator('tr', { hasText: title }).first();
      await row.getByRole('button', { name: 'Stop now' }).click();
      const modal = adminPage.locator('.modal');
      await modal.getByRole('button', { name: 'Stop downtime' }).click();
      await adminPage.getByText('Downtime stopped').first().waitFor({ timeout: 15000 });
      await userPage.reload({ waitUntil: 'networkidle' });
      await userPage.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });
      assert.equal(await userPage.locator('.downtime-page-card').count(), 0);
    });

    await test('admin can cancel a future scheduled downtime through the UI', async () => {
      const cancelTitle = 'E2E Cancel ' + Date.now();
      await adminPage.getByRole('button', { name: '+ Schedule Downtime' }).click();
      const form = adminPage.locator('.modal');
      await form.locator('input[type="text"]').fill(cancelTitle);
      await fillDowntimeWindow(form, Date.now() + 4 * 60 * 60 * 1000, Date.now() + 5 * 60 * 60 * 1000);
      await form.getByRole('button', { name: 'Schedule', exact: true }).click();
      await adminPage.getByText('Downtime scheduled').first().waitFor({ timeout: 15000 });
      const row = adminPage.locator('tr', { hasText: cancelTitle }).first();
      await row.getByRole('button', { name: 'Cancel' }).click();
      const confirm = adminPage.locator('.modal');
      await confirm.getByRole('button', { name: 'Cancel downtime' }).click();
      await adminPage.getByText('Scheduled downtime cancelled').first().waitFor({ timeout: 15000 });
      await adminPage.locator('tr', { hasText: cancelTitle }).getByText('Cancelled').waitFor({ timeout: 15000 });
    });

    await test('mobile downtime page renders and remains usable during active downtime', async () => {
      const createRes = await fetch(BASE + '/api/downtime', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(admin.id || admin._id),
          'x-user-email': admin.email
        },
        body: JSON.stringify({
          title: 'Mobile Maintenance',
          message: 'Mobile maintenance message',
          startAt: new Date(Date.now() - 1000).toISOString(),
          endAt: new Date(Date.now() + 60000).toISOString()
        })
      });
      assert.equal(createRes.status, 201);
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(BASE + '/login', { waitUntil: 'networkidle' });
      await mobilePage.getByPlaceholder('Enter your email').fill(USER.email);
      await mobilePage.getByPlaceholder('Enter your password').fill(USER.password);
      await mobilePage.getByRole('button', { name: 'Sign In' }).click();
      await mobilePage.getByRole('heading', { name: /We’ll be back shortly|We'll be back shortly/ }).waitFor({ timeout: 15000 });
      const card = mobilePage.locator('.downtime-page-card');
      assert.ok((await card.innerText()).includes('Mobile maintenance message'));
      await mobilePage.getByRole('button', { name: 'Check again' }).waitFor();
      await mobileContext.close();
      await cleanup();
    });
  } finally {
    await cleanup();
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`\n${f.name}\n${f.err.stack}`);
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
