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

async function openSection(scope, name) {
  const expand = scope.getByRole('button', { name: `Expand ${name}` });
  if (await expand.count()) await expand.first().click();
}

(async () => {
  assert.ok(USER.email && USER.password && ADMIN.email && ADMIN.password, 'TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are required');

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();

  try {
    await login(page, USER);
    await page.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });

    await test('primary Add Record action sits above the dashboard sections and opens the form', async () => {
      const addButton = page.getByRole('button', { name: '+ Add Record' }).first();
      await addButton.waitFor({ timeout: 15000 });
      const addBox = await addButton.boundingBox();
      const statsBox = await page.locator('.stats-grid').boundingBox();
      assert.ok(addBox.y < statsBox.y, 'Add Record should appear above the dashboard stats and lists');
      await addButton.click();
      await page.getByRole('heading', { name: 'Add Gift Card Record' }).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Cancel' }).click();
    });

    await test('dashboard order puts My Gift Cards directly below the header actions', async () => {
      const addBox = await page.getByRole('button', { name: '+ Add Record' }).first().boundingBox();
      const recordsBox = await page.locator('.records-section').boundingBox();
      const statsBox = await page.locator('.stats-grid').boundingBox();
      const summaryBox = await page.locator('.payment-summary').boundingBox();
      assert.ok(addBox.y < recordsBox.y, 'Add Record should stay above the dashboard sections');
      assert.ok(recordsBox.y < statsBox.y, 'My Gift Cards should come before the stats grid');
      assert.ok(statsBox.y < summaryBox.y, 'Payment Summary should follow the stats grid');
    });

    await test('section controls are icon-only chevrons with accessible labels', async () => {
      const toggle = page.locator('.records-section .section-collapse-btn');
      assert.equal((await toggle.innerText()).trim(), '', 'section toggle should not render text labels');
      assert.equal(await toggle.getAttribute('aria-label'), 'Expand My Gift Cards');
      assert.equal(await toggle.locator('svg').count(), 1, 'section toggle should render a chevron icon');
      const panelToggle = page.locator('.payment-summary .section-collapse-btn').first();
      assert.equal((await panelToggle.innerText()).trim(), '', 'payment panel toggles should not render text labels');
      assert.equal(await panelToggle.locator('svg').count(), 1);
    });

    await test('user dashboard shows the payment summary with recorded totals', async () => {
      await page.getByRole('heading', { name: 'Payment Summary' }).waitFor({ timeout: 15000 });
      const summary = page.locator('.payment-summary');
      await summary.getByText(/All time:/).waitFor({ timeout: 15000 });
      assert.equal(await summary.locator('.payment-kpi').count(), 4);
      assert.ok((await summary.locator('.payment-summary-alltime').innerText()).includes('paid-back record'));
    });

    await test('recent activity is no longer shown on the user dashboard', async () => {
      const summary = page.locator('.payment-summary');
      assert.equal(await summary.getByRole('heading', { name: 'Recent activity' }).count(), 0);
      assert.equal(await summary.locator('.payment-activity-panel').count(), 0);
      assert.equal(await summary.locator('.payment-timeline').count(), 0);
    });

    await test('daily payment groups expand to show individual records and amounts', async () => {
      const summary = page.locator('.payment-summary');
      await openSection(summary, 'Payment history by date');
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
      await openSection(summary, 'Payment history by date');
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
      await openSection(summary, 'Payment trend');
      await summary.locator('.payment-chart-column').first().waitFor({ timeout: 15000 });
      await summary.getByRole('button', { name: 'Weekly', exact: true }).click();
      await summary.locator('.payment-chart-column').first().waitFor({ timeout: 15000 });
      await summary.getByRole('button', { name: 'Monthly', exact: true }).click();
      await summary.locator('.payment-chart-column').first().waitFor({ timeout: 15000 });
      await summary.getByRole('button', { name: 'Daily', exact: true }).click();

      const firstBar = summary.locator('.payment-chart-column-btn').first();
      await firstBar.click();
      const detail = summary.locator('.payment-chart-detail');
      await detail.waitFor({ timeout: 15000 });
      assert.ok((await detail.innerText()).includes('₹'), 'trend detail should show an exact currency total');
      assert.equal(await firstBar.getAttribute('aria-pressed'), 'true');
      assert.ok((await summary.locator('.payment-chart-meta').innerText()).includes('Daily'));
      assert.ok((await summary.locator('.payment-chart-yaxis-label').first().innerText()).includes('₹'));
    });

    await test('pending payments are clearly separated from recorded payments', async () => {
      const summary = page.locator('.payment-summary');
      const pending = summary.locator('.payment-pending-panel');
      await pending.waitFor({ timeout: 15000 });
      await openSection(summary, 'Pending payments');
      const text = await pending.innerText();
      assert.ok(text.includes('Not yet recorded as paid back'));
      assert.ok(text.includes('No future payment dates are estimated'));
    });

    await test('user display limits accept All and survive collapsing sections', async () => {
      const summary = page.locator('.payment-summary');
      await summary.getByText(/All time:/).waitFor({ timeout: 15000 });
      await openSection(summary, 'Payment history by date');
      const historyLimit = summary.locator('#payment-history-limit');
      await historyLimit.selectOption('all');
      assert.equal(await historyLimit.inputValue(), 'all');
      await summary.getByRole('button', { name: 'Collapse Payment history by date' }).click();
      await summary.getByRole('button', { name: 'Expand Payment history by date' }).click();
      assert.equal(await historyLimit.inputValue(), 'all');
    });

    await test('My Gift Cards starts collapsed and supports an All-records limit', async () => {
      const panel = page.locator('#my-gift-cards-panel');
      assert.equal(await panel.count(), 0, 'My Gift Cards should start minimized');
      await page.getByRole('button', { name: 'Expand My Gift Cards' }).click();
      await panel.waitFor({ timeout: 15000 });
      const response = page.waitForResponse(resp => resp.url().includes('/api/gc-records') && resp.url().includes('limit=all'), { timeout: 15000 });
      const limit = page.locator('#my-gift-cards-limit');
      await limit.selectOption('all');
      await response;
      assert.equal(await limit.inputValue(), 'all');
    });

    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobile.newPage();

    await test('mobile payment summary stays within the viewport and keeps groups usable', async () => {
      await login(mobilePage, USER);
      await mobilePage.getByRole('heading', { name: 'Payment Summary' }).waitFor({ timeout: 15000 });
      const summary = mobilePage.locator('.payment-summary');
      await summary.getByText(/All time:/).waitFor({ timeout: 15000 });
      await openSection(summary, 'Payment history by date');
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

    await test('mobile dashboard stays compact and ordered at 320, 375, and 430px', async () => {
      for (const width of [320, 375, 430]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const mobilePage = await context.newPage();
        try {
          await login(mobilePage, USER);
          await mobilePage.getByRole('heading', { name: 'My Dashboard' }).waitFor({ timeout: 15000 });

          const recordsBox = await mobilePage.locator('.records-section').boundingBox();
          const statsBox = await mobilePage.locator('.stats-grid').boundingBox();
          const summaryBox = await mobilePage.locator('.payment-summary').boundingBox();
          assert.ok(recordsBox.y < statsBox.y, `${width}px: My Gift Cards should come first`);
          assert.ok(statsBox.y < summaryBox.y, `${width}px: Payment Summary should follow stats`);

          await mobilePage.getByRole('button', { name: 'Expand My Gift Cards' }).click();
          await mobilePage.locator('#my-gift-cards-panel').waitFor({ timeout: 15000 });

          const filterBar = await mobilePage.locator('.payment-filter-bar').boundingBox();
          const searchGroup = await mobilePage.locator('.payment-filter-bar .payment-search-group').boundingBox();
          assert.ok(searchGroup.height < 100, `${width}px: payment search should not stretch vertically (${searchGroup.height}px)`);
          assert.ok(filterBar.height < 320, `${width}px: payment filters should stay compact (${filterBar.height}px)`);

          const toggle = mobilePage.locator('.records-section .section-collapse-btn');
          assert.equal((await toggle.innerText()).trim(), '');
          assert.equal(await toggle.getAttribute('aria-label'), 'Collapse My Gift Cards');

          const summary = mobilePage.locator('.payment-summary');
          await openSection(summary, 'Payment trend');
          const trendPanel = summary.locator('.payment-trend-panel');
          const trendPanelBox = await trendPanel.boundingBox();
          const trendControlsBox = await trendPanel.locator('.payment-panel-controls').boundingBox();
          assert.ok(trendControlsBox.width <= trendPanelBox.width + 1, `${width}px: trend controls should stay inside the panel`);
          await trendPanel.locator('.payment-chart-column-btn').first().waitFor({ timeout: 15000 });
          const chartScrollOverflow = await trendPanel.locator('.payment-chart-scroll').evaluate(el => el.scrollWidth - el.clientWidth);
          assert.ok(chartScrollOverflow >= 0, `${width}px: trend chart should scroll inside its container`);

          const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          assert.ok(overflow <= 1, `${width}px: page should not overflow horizontally (overflow ${overflow}px)`);
        } finally {
          await context.close();
        }
      }
    });

    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const adminPage = await adminContext.newPage();
    await test('admin dashboard remains available and unchanged', async () => {
      await login(adminPage, ADMIN);
      await adminPage.getByRole('heading', { name: 'Admin Dashboard' }).waitFor({ timeout: 15000 });
      await adminPage.getByText('Total Records').first().waitFor({ timeout: 15000 });
      assert.equal(await adminPage.getByRole('heading', { name: 'Payment Summary' }).count(), 0);
      await adminPage.locator('#admin-per-user-limit').waitFor({ timeout: 15000 });
    });

    await test('admin list views expose display-limit controls including All', async () => {
      await adminPage.getByRole('button', { name: 'Records', exact: true }).click();
      const recordsLimit = adminPage.locator('#admin-records-limit');
      await recordsLimit.waitFor({ timeout: 15000 });
      assert.equal(await recordsLimit.locator('option[value="all"]').count(), 1);
      await recordsLimit.selectOption('all');

      await adminPage.getByRole('button', { name: 'Users', exact: true }).click();
      const usersLimit = adminPage.locator('#admin-users-limit');
      await usersLimit.waitFor({ timeout: 15000 });
      assert.equal(await usersLimit.locator('option[value="all"]').count(), 1);
      await usersLimit.selectOption('all');

      await adminPage.getByRole('button', { name: 'Audit', exact: true }).click();
      const auditLimit = adminPage.locator('#admin-audit-limit');
      await auditLimit.waitFor({ timeout: 15000 });
      assert.equal(await auditLimit.locator('option[value="all"]').count(), 1);
      await auditLimit.selectOption('all');

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
