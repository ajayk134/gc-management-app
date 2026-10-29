const assert = require('assert');

const BASE = process.env.API_BASE || 'http://localhost:5001';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const USER_EMAIL = process.env.TEST_USER_EMAIL;
const USER_PASSWORD = process.env.TEST_USER_PASSWORD;

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

async function req(method, path, { user, body, headers = {} } = {}) {
  const h = { ...headers };
  if (user) {
    if (user.id || user._id) h['x-user-id'] = String(user.id || user._id);
    if (user.email) h['x-user-email'] = user.email;
  }
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function login(email, password) {
  return req('POST', '/api/auth/login', { body: { email, password } });
}

const dateKey = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = type => parts.find(part => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

(async () => {
  assert.ok(ADMIN_EMAIL && ADMIN_PASSWORD && USER_EMAIL && USER_PASSWORD, 'TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD are required');

  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const userLogin = await login(USER_EMAIL, USER_PASSWORD);
  assert.equal(adminLogin.status, 200);
  assert.equal(userLogin.status, 200);
  const admin = adminLogin.data.user;
  const user = userLogin.data.user;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = `PS-${runId}`;
  const createdRecordIds = [];
  let user2 = null;
  const timeZone = 'Asia/Kolkata';
  const today = dateKey(new Date(), timeZone);
  const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000), timeZone);

  async function createRecord(owner, suffix, overrides = {}) {
    const body = {
      giftCard: `${tag}-${suffix}`,
      giftCardPin: `PIN-${runId}-${suffix}`,
      giftCardAmount: 100,
      paid: 80,
      provider: 'Amazon',
      notes: `${tag} notes`,
      ...overrides
    };
    if (owner) body.userId = owner.id || owner._id;
    const created = await req('POST', '/api/gc-records', { user: owner ? admin : user, body });
    assert.equal(created.status, 201, `create ${suffix} failed: ${JSON.stringify(created.data)}`);
    createdRecordIds.push(created.data.record._id);
    return created.data.record;
  }

  try {
    const user2Created = await req('POST', '/api/users', {
      user: admin,
      body: { name: `Payment Summary Test ${runId}`, email: `payment.summary.${runId}@example.com`, password: 'TestPass123' }
    });
    assert.equal(user2Created.status, 201);
    user2 = user2Created.data.user;

    await test('a user with no records gets a safe empty summary', async () => {
      const empty = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}`, { user: user2 });
      assert.equal(empty.status, 200);
      assert.equal(empty.data.groups.length, 0);
      assert.equal(empty.data.filtered.paidBackCount, 0);
      assert.equal(empty.data.pending.count, 0);
      assert.equal(empty.data.allTime.totalRecords, 0);
      assert.equal(empty.data.allTime.totalAmountPaid, 0);
    });

    const recordA = await createRecord(null, 'A', { giftCardAmount: 100, paid: 80 });
    const recordB = await createRecord(null, 'B', { giftCardAmount: 400, paid: 300, provider: 'Flipkart' });
    const recordPending = await createRecord(null, 'P', { giftCardAmount: 40, paid: 25, provider: 'Croma' });
    const recordOther = await createRecord(user2, 'OTHER', { giftCardAmount: 600, paid: 500 });

    const paidA = await req('POST', `/api/gc-records/${recordA._id}/pay`, { user: admin, body: {} });
    const paidB = await req('POST', `/api/gc-records/${recordB._id}/pay`, { user: admin, body: {} });
    const paidOther = await req('POST', `/api/gc-records/${recordOther._id}/pay`, { user: admin, body: {} });
    assert.equal(paidA.status, 200);
    assert.equal(paidB.status, 200);
    assert.equal(paidOther.status, 200);

    const adjusted = await req('PUT', `/api/gc-records/${recordA._id}`, { user: admin, body: { adjustedAmount: 90 } });
    assert.equal(adjusted.status, 200);
    assert.equal(adjusted.data.record.adjustedAmount, 90);

    await test('payment summary is available only to the authenticated owner role', async () => {
      const anonymous = await req('GET', `/api/stats/user/payments?search=${encodeURIComponent(tag)}`);
      assert.equal(anonymous.status, 401);
      const adminCall = await req('GET', `/api/stats/user/payments?search=${encodeURIComponent(tag)}`, { user: admin });
      assert.equal(adminCall.status, 403);
    });

    await test('all-time summary matches the existing user stats endpoint', async () => {
      const summary = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}`, { user });
      assert.equal(summary.status, 200);
      const stats = await req('GET', '/api/stats/user', { user });
      assert.equal(stats.status, 200);
      assert.equal(summary.data.allTime.totalRecords, stats.data.totalRecords);
      assert.equal(summary.data.allTime.totalGiftCardAmount, stats.data.totalAmount);
      assert.equal(summary.data.allTime.totalAmountPaid, stats.data.totalPaid);
      assert.equal(summary.data.allTime.totalPaidBackAmount, stats.data.paidBackAmount);
      assert.equal(summary.data.allTime.pendingCount, stats.data.pendingCount);
      assert.equal(summary.data.allTime.pendingAmount, stats.data.pendingAmount);
      assert.equal(summary.data.allTime.totalPaidBackAmount + summary.data.allTime.pendingAmount, summary.data.allTime.totalAmountPaid);
    });

    await test('daily groups use effective paid amounts and exclude PINs', async () => {
      const summary = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag)}`, { user });
      assert.equal(summary.status, 200);
      assert.equal(summary.data.filtered.paidBackCount, 2);
      assert.equal(summary.data.filtered.totalPaidBackAmount, 390);
      assert.equal(summary.data.filtered.dayCount, 1);
      assert.equal(summary.data.groups.length, 1);
      assert.equal(summary.data.groups[0].key, today);
      assert.equal(summary.data.groups[0].count, 2);
      assert.equal(summary.data.groups[0].totalPaid, 390);
      assert.ok(summary.data.groups[0].records.every(record => record.giftCardPin === undefined));
      assert.equal(summary.data.pending.count, 1);
      assert.equal(summary.data.pending.amount, 25);
    });

    await test('recent activity supports finite limits and the All option', async () => {
      const limited = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&recentLimit=1`, { user });
      assert.equal(limited.status, 200);
      assert.equal(limited.data.recentActivity.length, 1);
      assert.ok(limited.data.recentActivityTotal >= 1);

      const all = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&recentLimit=all`, { user });
      assert.equal(all.status, 200);
      assert.equal(all.data.recentActivity.length, all.data.recentActivityTotal);
      assert.ok(all.data.recentActivityTotal > limited.data.recentActivity.length);
    });

    await test('record lists support the All option without dropping historical rows', async () => {
      const firstPage = await req('GET', '/api/gc-records?limit=1&page=1', { user });
      assert.equal(firstPage.status, 200);
      assert.equal(firstPage.data.records.length, 1);
      assert.ok(firstPage.data.pagination.total >= 1);

      const allRecords = await req('GET', '/api/gc-records?limit=all', { user });
      assert.equal(allRecords.status, 200);
      assert.equal(allRecords.data.pagination.limit, 'all');
      assert.equal(allRecords.data.pagination.all, true);
      assert.equal(allRecords.data.records.length, allRecords.data.pagination.total);
    });

    await test('date range filters use recorded paid-back dates', async () => {
      const todayResult = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag)}&startDate=${today}&endDate=${today}`, { user });
      assert.equal(todayResult.status, 200);
      assert.equal(todayResult.data.filtered.paidBackCount, 2);

      const oldResult = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag)}&startDate=${yesterday}&endDate=${yesterday}`, { user });
      assert.equal(oldResult.status, 200);
      assert.equal(oldResult.data.filtered.paidBackCount, 0);
      assert.equal(oldResult.data.groups.length, 0);
    });

    await test('search and amount sorting select the expected records and totals', async () => {
      const searchB = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag + '-B')}`, { user });
      assert.equal(searchB.status, 200);
      assert.equal(searchB.data.filtered.paidBackCount, 1);
      assert.equal(searchB.data.filtered.totalPaidBackAmount, 300);
      assert.equal(searchB.data.groups[0].records[0].giftCard, `${tag}-B`);

      const sorted = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag)}&sort=amount-desc`, { user });
      assert.equal(sorted.status, 200);
      assert.ok(sorted.data.groups.length >= 1);
    });

    await test('strict user isolation keeps other users records out', async () => {
      const userSummary = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag)}`, { user });
      assert.equal(userSummary.status, 200);
      const userCards = userSummary.data.groups.flatMap(group => group.records.map(record => record.giftCard));
      assert.ok(!userCards.includes(`${tag}-OTHER`));

      const otherSummary = await req('GET', `/api/stats/user/payments?timeZone=${encodeURIComponent(timeZone)}&search=${encodeURIComponent(tag)}`, { user: user2 });
      assert.equal(otherSummary.status, 200);
      assert.equal(otherSummary.data.filtered.paidBackCount, 1);
      assert.equal(otherSummary.data.filtered.totalPaidBackAmount, 500);
      assert.equal(otherSummary.data.groups[0].records[0].giftCard, `${tag}-OTHER`);
    });

    await test('invalid time zones and malformed dates return 400', async () => {
      const badZone = await req('GET', '/api/stats/user/payments?timeZone=Not%2FAZone', { user });
      assert.equal(badZone.status, 400);
      const badDate = await req('GET', '/api/stats/user/payments?startDate=01-06-2026', { user });
      assert.equal(badDate.status, 400);
    });
  } finally {
    for (const id of createdRecordIds) {
      await req('DELETE', `/api/gc-records/${id}`, { user: admin });
    }
    if (user2) {
      await req('DELETE', `/api/users/${user2.id || user2._id}`, { user: admin });
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
