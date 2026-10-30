const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs/promises');
const XLSX = require('xlsx');

const BASE = process.env.UI_BASE || 'http://localhost:5001';
const API_BASE = process.env.API_BASE || BASE;
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

async function api(method, path, { user, body } = {}) {
  const headers = {};
  if (user) {
    headers['x-user-id'] = String(user.id || user._id);
    headers['x-user-email'] = user.email;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text };
}

async function login(page, creds) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Enter your email').fill(creds.email);
  await page.getByPlaceholder('Enter your password').fill(creds.password);
  await Promise.all([
    page.waitForURL(/\/(admin|user)$/, { timeout: 20000 }),
    page.getByRole('button', { name: 'Sign In' }).click()
  ]);
  await page.waitForLoadState('networkidle');
}

async function openRecords(page) {
  await page.getByRole('heading', { name: 'Admin Dashboard' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Records', exact: true }).click();
  await page.getByRole('heading', { name: 'Gift Card Records' }).waitFor({ timeout: 20000 });
}

async function searchFor(page, value) {
  const input = page.getByLabel('Search records');
  const response = page.waitForResponse(
    (resp) => resp.url().includes('/api/gc-records') && resp.url().includes(`search=${encodeURIComponent(value).replace(/%20/g, '+')}`),
    { timeout: 20000 }
  );
  await input.fill(value);
  await response;
  await page.waitForTimeout(150);
}

const summaryValue = (page, label) => page.locator('.ar-summary-card', { hasText: label }).locator('.ar-summary-value');

(async () => {
  assert.ok(ADMIN.email && ADMIN.password && USER.email && USER.password, 'TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD are required');

  const adminLogin = await api('POST', '/api/auth/login', { body: ADMIN });
  const userLogin = await api('POST', '/api/auth/login', { body: USER });
  assert.equal(adminLogin.status, 200, `admin login failed: ${JSON.stringify(adminLogin.data)}`);
  assert.equal(userLogin.status, 200, `user login failed: ${JSON.stringify(userLogin.data)}`);
  const admin = adminLogin.data.user;
  const user = userLogin.data.user;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = `ARE2E-${runId}`;
  const pin = `PIN-E2E-SECRET-${runId}`;
  const createdIds = [];
  let recordC = null;

  async function createRecord(key, overrides = {}) {
    const response = await api('POST', '/api/gc-records', {
      user: admin,
      body: {
        giftCard: `${tag}-${key}`,
        giftCardPin: `${pin}-${key}`,
        giftCardAmount: 100,
        paid: 60,
        provider: 'Amazon',
        notes: `${tag}-notes-${key}`,
        userId: user.id || user._id,
        ...overrides
      }
    });
    assert.equal(response.status, 201, `create ${key} failed: ${JSON.stringify(response.data)}`);
    createdIds.push(response.data.record._id);
    return response.data.record;
  }

  const browser = await chromium.launch({ headless: true });

  try {
    await createRecord('A', { giftCardAmount: 100, paid: 60 });
    await createRecord('B', { giftCardAmount: 200, paid: 150, provider: 'Flipkart' });
    recordC = await createRecord('C', { giftCardAmount: 300, paid: 200, provider: 'Croma' });

    const paid = await api('POST', `/api/gc-records/${recordC._id}/pay`, { user: admin, body: { adminNote: `${tag}-admin-note` } });
    assert.equal(paid.status, 200);
    const adjusted = await api('PUT', `/api/gc-records/${recordC._id}`, { user: admin, body: { adjustedAmount: 250 } });
    assert.equal(adjusted.status, 200);

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await desktop.newPage();

    await login(page, ADMIN);
    await openRecords(page);

    await test('records workspace renders summary cards, filters, presets, and compact controls', async () => {
      await page.locator('#admin-records-limit').waitFor({ timeout: 20000 });
      assert.equal(await page.locator('.ar-summary-card').count(), 6);
      assert.equal(await page.getByRole('button', { name: 'Filters' }).count(), 1);
      assert.equal(await page.locator('.ar-preset').count(), 4);
      assert.ok(await page.locator('#admin-records-limit').count());
      assert.ok(await page.locator('.ar-table').count());
    });

    await test('Add Record form opens and closes without exposing a stored PIN', async () => {
      await page.getByRole('button', { name: 'Add Record', exact: true }).click();
      await page.getByRole('heading', { name: 'Add Record', exact: true }).waitFor({ timeout: 15000 });
      const pinInput = page.locator('.modal .form-group', { hasText: 'Gift Card PIN' }).locator('input');
      assert.equal(await pinInput.inputValue(), '');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    });

    await test('search updates rows and the filter-scoped summary', async () => {
      await searchFor(page, tag);
      assert.equal(await page.locator('.ar-table tbody tr').count(), 3);
      assert.equal((await summaryValue(page, 'Total records').innerText()).trim(), '3');
      assert.equal((await summaryValue(page, 'Pending records').innerText()).trim(), '2');
      assert.equal((await summaryValue(page, 'Paid back records').innerText()).trim(), '1');
      assert.ok((await summaryValue(page, 'Total paid amount').innerText()).includes('460'));
      assert.ok(!(await page.locator('body').innerText()).includes(pin), 'PIN must not be rendered in the workspace');
    });

    await test('bulk pay and undo handle selected and already-paid records', async () => {
      const checkboxes = page.locator('.ar-table tbody input[type="checkbox"]');
      for (let i = 0; i < await checkboxes.count(); i += 1) await checkboxes.nth(i).check();
      const payResponse = page.waitForResponse((resp) => resp.url().includes('/api/gc-records/bulk-pay'), { timeout: 20000 });
      await page.getByRole('button', { name: 'Mark selected as paid back' }).click();
      await page.locator('.modal').getByRole('button', { name: 'Mark paid back', exact: true }).click();
      assert.equal((await payResponse).status(), 200);
      await page.waitForFunction(() => {
        const card = [...document.querySelectorAll('.ar-summary-card')].find((item) => item.textContent.includes('Pending records'));
        return card?.querySelector('.ar-summary-value')?.textContent.trim() === '0';
      }, null, { timeout: 20000 });
      assert.equal((await summaryValue(page, 'Pending records').innerText()).trim(), '0');
      assert.equal((await summaryValue(page, 'Paid back records').innerText()).trim(), '3');

      const afterPay = page.locator('.ar-table tbody input[type="checkbox"]');
      for (let i = 0; i < await afterPay.count(); i += 1) await afterPay.nth(i).check();
      const undoResponse = page.waitForResponse((resp) => resp.url().includes('/api/gc-records/bulk-undo-pay'), { timeout: 20000 });
      await page.getByRole('button', { name: 'Undo payment', exact: true }).click();
      await page.locator('.modal').getByRole('button', { name: 'Undo payments', exact: true }).click();
      assert.equal((await undoResponse).status(), 200);
      await page.waitForFunction(() => {
        const card = [...document.querySelectorAll('.ar-summary-card')].find((item) => item.textContent.includes('Pending records'));
        return card?.querySelector('.ar-summary-value')?.textContent.trim() === '3';
      }, null, { timeout: 20000 });
      assert.equal((await summaryValue(page, 'Pending records').innerText()).trim(), '3');
    });

    await test('advanced amount filters, chips, and clear-all work together', async () => {
      await page.locator('.ar-filter-button').click();
      await page.locator('.ar-filter-panel').waitFor({ timeout: 15000 });
      await page.locator('#ar-filter-min').fill('100');
      await page.locator('#ar-filter-max').fill('250');
      const response = page.waitForResponse((resp) => resp.url().includes('/api/gc-records') && resp.url().includes('minAmount=100'), { timeout: 20000 });
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await response;
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.ar-table tbody tr').count(), 2);
      assert.ok((await page.locator('.ar-filter-chips').innerText()).includes('GC amount'));

      await page.getByRole('button', { name: 'Clear all', exact: true }).click();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.ar-filter-chips').count(), 0);
      assert.equal((await page.getByLabel('Search records').inputValue()), '');
    });

    await test('presets and sortable columns apply clean query state', async () => {
      await searchFor(page, tag);
      const presetResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/gc-records') && resp.url().includes('status=paid_back'),
        { timeout: 20000 }
      );
      await page.locator('.ar-preset', { hasText: 'Paid Back' }).click();
      await presetResponse;
      await page.waitForTimeout(150);
      assert.equal(await page.getByLabel('Search records').inputValue(), '');
      assert.equal(await page.locator('.ar-table tbody tr').count() > 0, true);
      const rowCount = await page.locator('.ar-table tbody tr').count();
      assert.equal(await page.locator('.ar-table tbody tr .status-paid').count(), rowCount);

      const allResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/gc-records') && !resp.url().includes('status='),
        { timeout: 20000 }
      );
      await page.locator('.ar-preset', { hasText: 'All Records' }).click();
      await allResponse;
      await page.waitForTimeout(150);
      await searchFor(page, tag);
      const sortResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/gc-records') && resp.url().includes('sort=giftCard') && resp.url().includes('order=asc'),
        { timeout: 20000 }
      );
      await page.getByRole('button', { name: 'Gift Card', exact: true }).click();
      await sortResponse;
      await page.waitForTimeout(150);
      const firstCard = (await page.locator('.ar-table tbody .ar-record-link').first().innerText()).trim();
      assert.equal(firstCard, `${tag}-A`);
    });

    await test('column preferences can reveal notes and persist the choice', async () => {
      await page.getByRole('button', { name: 'Column preferences' }).click();
      const notes = page.locator('.ar-column-menu .ar-check-row', { hasText: 'Notes' }).locator('input');
      assert.equal(await notes.isChecked(), false);
      await notes.check();
      assert.ok(await page.locator('.ar-table th', { hasText: 'Notes' }).count());
      const stored = await page.evaluate(() => localStorage.getItem('gc-admin-records-columns-v1'));
      assert.ok(stored.includes('"notes":true'));
      await page.getByRole('button', { name: 'Reset columns' }).click();
      assert.equal(await page.locator('.ar-table th', { hasText: 'Notes' }).count(), 0);
    });

    await test('record detail drawer hides the PIN and offers contextual actions', async () => {
      await page.locator('.ar-table tbody .ar-record-link').first().click();
      const drawer = page.locator('.ar-drawer');
      await drawer.waitFor({ timeout: 15000 });
      assert.ok((await drawer.innerText()).includes('Hidden for security'));
      assert.ok(!(await drawer.innerText()).includes(pin));
      assert.equal(await drawer.getByRole('button', { name: /^(Edit|Share|Unshare|Mark as paid back|Undo payment)$/ }).count() >= 2, true);
      await drawer.getByRole('button', { name: 'Close record details' }).click();
      assert.equal(await page.locator('.ar-drawer').count(), 0);
    });

    await test('All rows option and CSV export honor the active search without PINs', async () => {
      const allResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/gc-records') && resp.url().includes('limit=all'),
        { timeout: 20000 }
      );
      await page.locator('#admin-records-limit').selectOption('all');
      await allResponse;
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.ar-table tbody tr').count(), 3);

      const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
      await page.getByRole('button', { name: 'Export records' }).click();
      await page.getByRole('menuitem', { name: 'Export as CSV' }).click();
      const download = await downloadPromise;
      const filePath = await download.path();
      const contents = await fs.readFile(filePath, 'utf8');
      assert.ok(contents.includes(`${tag}-A`));
      assert.ok(!contents.includes(pin));
      assert.ok(!contents.toLowerCase().includes('gift card pin'));
    });

    await test('Excel export downloads exactly the columns visible in the records table', async () => {
      await page.getByRole('button', { name: 'Column preferences' }).click();
      for (const label of ['Provider', 'Paid amount', 'Shared', 'Paid back date']) {
        await page.locator('.ar-column-menu .ar-check-row', { hasText: label }).locator('input').uncheck();
      }
      await page.getByRole('button', { name: 'Column preferences' }).click();

      const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
      await page.getByRole('button', { name: 'Export records' }).click();
      await page.getByRole('menuitem', { name: 'Export as Excel' }).click();
      const download = await downloadPromise;
      const buffer = await fs.readFile(await download.path());
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
      const rows = XLSX.utils.sheet_to_json(sheet);

      assert.deepEqual(headers, [
        'User', 'Email', 'Gift Card', 'Gift Card Amount', 'Payment Status', 'Submitted At'
      ]);
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map((row) => row['Gift Card']).sort(), [`${tag}-A`, `${tag}-B`, `${tag}-C`]);
      assert.ok(rows.every((row) => !('Provider' in row)));
      assert.ok(rows.every((row) => !('Paid (Original)' in row)));
      assert.ok(rows.every((row) => !('Adjusted Amount' in row)));
      assert.ok(rows.every((row) => !('Shared' in row)));
      assert.ok(rows.every((row) => !('Paid Back At' in row)));
      assert.ok(rows.every((row) => !('Notes' in row)));
      assert.ok(!JSON.stringify(rows).includes(pin));

      await page.getByRole('button', { name: 'Column preferences' }).click();
      await page.getByRole('button', { name: 'Reset columns' }).click();
    });

    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();
    await login(mobilePage, ADMIN);
    await openRecords(mobilePage);
    await searchFor(mobilePage, tag);

    await test('mobile layout uses compact cards, keeps actions usable, and never overflows', async () => {
      assert.equal(await mobilePage.locator('.ar-table-container').isVisible(), false);
      assert.equal(await mobilePage.locator('.ar-mobile-record').count(), 3);
      const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `page should not overflow horizontally (overflow ${overflow}px)`);

      await mobilePage.locator('.ar-filter-button').click();
      await mobilePage.locator('.ar-filter-panel').waitFor({ timeout: 15000 });
      const panelBox = await mobilePage.locator('.ar-filter-panel').boundingBox();
      assert.ok(panelBox.width <= 390);
      await mobilePage.getByRole('button', { name: 'Cancel' }).click();

      await mobilePage.locator('.ar-mobile-title').first().click();
      await mobilePage.locator('.ar-drawer').waitFor({ timeout: 15000 });
      assert.ok((await mobilePage.locator('.ar-drawer').innerText()).includes('Hidden for security'));
      await mobilePage.getByRole('button', { name: 'Close record details' }).click();
    });

    await mobile.close();
  } finally {
    await browser.close();
    for (const id of createdIds) {
      await api('DELETE', `/api/gc-records/${id}`, { user: admin });
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
    process.exit(1);
  }
})();
