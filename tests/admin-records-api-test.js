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

async function req(method, path, { user, body } = {}) {
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
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString('utf8');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text, buffer };
}

const login = (email, password) => req('POST', '/api/auth/login', { body: { email, password } });

(async () => {
  assert.ok(ADMIN_EMAIL && ADMIN_PASSWORD && USER_EMAIL && USER_PASSWORD, 'TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD are required');

  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const userLogin = await login(USER_EMAIL, USER_PASSWORD);
  assert.equal(adminLogin.status, 200, `admin login failed: ${JSON.stringify(adminLogin.data)}`);
  assert.equal(userLogin.status, 200, `user login failed: ${JSON.stringify(userLogin.data)}`);
  const admin = adminLogin.data.user;
  const user = userLogin.data.user;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = `AR-${runId}`;
  const pin = `PIN-SECRET-${runId}`;
  const today = new Date().toISOString().slice(0, 10);
  const createdIds = [];
  const created = {};

  async function createRecord(key, overrides = {}, owner = user) {
    const body = {
      giftCard: `${tag}-${key}`,
      giftCardPin: key === 'A' ? pin : `${pin}-${key}`,
      giftCardAmount: 100,
      paid: 60,
      provider: 'Amazon',
      notes: `${tag}-notes-${key}`,
      ...overrides
    };
    if (owner) body.userId = owner.id || owner._id;
    const result = await req('POST', '/api/gc-records', { user: admin, body });
    assert.equal(result.status, 201, `create ${key} failed: ${JSON.stringify(result.data)}`);
    createdIds.push(result.data.record._id);
    created[key] = result.data.record;
    return result.data.record;
  }

  const recordsUrl = (query = '') => `/api/gc-records?${query}`;

  try {
    await createRecord('A', { giftCardAmount: 100, paid: 60, provider: `Amazon-${tag}`, notes: `alpha-${tag}` });
    await createRecord('B', { giftCardAmount: 200, paid: 150, provider: 'Flipkart', notes: `beta-${tag}` });
    await createRecord('C', { giftCardAmount: 300, paid: 200, provider: 'Croma', notes: `gamma-${tag}` });
    await createRecord('D', { giftCardAmount: 50, paid: 10, provider: 'Myntra', notes: `delta-${tag}` }, admin);

    const payC = await req('POST', `/api/gc-records/${created.C._id}/pay`, {
      user: admin,
      body: { adminNote: `admin-note-${tag}` }
    });
    assert.equal(payC.status, 200);
    const adjustC = await req('PUT', `/api/gc-records/${created.C._id}`, {
      user: admin,
      body: { adjustedAmount: 260 }
    });
    assert.equal(adjustC.status, 200);

    await test('admin list returns a filter-scoped summary with effective paid totals', async () => {
      const result = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&limit=all`), { user: admin });
      assert.equal(result.status, 200);
      assert.equal(result.data.records.length, 4);
      assert.equal(result.data.pagination.total, 4);
      assert.deepEqual(result.data.summary, {
        _id: null,
        totalRecords: 4,
        totalAmount: 650,
        totalPaid: 480,
        pendingAmount: 220,
        paidBackAmount: 260,
        pendingCount: 3,
        paidBackCount: 1
      });
    });

    await test('regular users remain scoped to their own records and receive no summary', async () => {
      const result = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&limit=all`), { user });
      assert.equal(result.status, 200);
      const cards = result.data.records.map((record) => record.giftCard).sort();
      assert.deepEqual(cards, [`${tag}-A`, `${tag}-B`, `${tag}-C`]);
      assert.equal(result.data.summary, undefined);
    });

    await test('status, amount, user, and shared filters combine correctly', async () => {
      const pending = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&status=pending&minAmount=100&maxAmount=200`), { user: admin });
      assert.equal(pending.status, 200);
      assert.deepEqual(pending.data.records.map((record) => record.giftCard).sort(), [`${tag}-A`, `${tag}-B`]);
      assert.equal(pending.data.summary.totalAmount, 300);
      assert.equal(pending.data.summary.totalPaid, 210);

      const paid = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&status=paid_back`), { user: admin });
      assert.equal(paid.status, 200);
      assert.equal(paid.data.records.length, 1);
      assert.equal(paid.data.records[0].giftCard, `${tag}-C`);
      assert.equal(paid.data.summary.paidBackAmount, 260);

      const byAdmin = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&userId=${admin.id || admin._id}`), { user: admin });
      assert.equal(byAdmin.status, 200);
      assert.deepEqual(byAdmin.data.records.map((record) => record.giftCard), [`${tag}-D`]);

      const share = await req('POST', '/api/gc-records/bulk-share', {
        user: admin,
        body: { recordIds: [created.A._id, created.B._id], shared: true }
      });
      assert.equal(share.status, 200);
      assert.equal(share.data.results.success.length, 2);

      const shared = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&shared=shared`), { user: admin });
      assert.equal(shared.status, 200);
      assert.deepEqual(shared.data.records.map((record) => record.giftCard).sort(), [`${tag}-A`, `${tag}-B`]);

      const unshared = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&shared=unshared`), { user: admin });
      assert.equal(unshared.status, 200);
      assert.deepEqual(unshared.data.records.map((record) => record.giftCard).sort(), [`${tag}-C`, `${tag}-D`]);

      const removeShare = await req('POST', '/api/gc-records/bulk-share', {
        user: admin,
        body: { recordIds: [created.A._id, created.B._id], shared: false }
      });
      assert.equal(removeShare.status, 200);
      assert.equal(removeShare.data.results.success.length, 2);
    });

    await test('submitted and paid-back date filters are inclusive', async () => {
      const submitted = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&startDate=${today}&endDate=${today}`), { user: admin });
      assert.equal(submitted.status, 200);
      assert.equal(submitted.data.records.length, 4);

      const paidToday = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&paidBackStartDate=${today}&paidBackEndDate=${today}`), { user: admin });
      assert.equal(paidToday.status, 200);
      assert.equal(paidToday.data.records.length, 1);
      assert.equal(paidToday.data.records[0].giftCard, `${tag}-C`);

      const future = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&paidBackStartDate=2999-01-01`), { user: admin });
      assert.equal(future.status, 200);
      assert.equal(future.data.records.length, 0);
      assert.equal(future.data.summary.totalRecords, 0);
    });

    await test('search covers identifier, provider, notes, admin note, user name/email, but never PIN', async () => {
      const provider = await req('GET', recordsUrl(`search=${encodeURIComponent(`Amazon-${tag}`)}`), { user: admin });
      assert.equal(provider.status, 200);
      assert.equal(provider.data.records.length, 1);
      assert.equal(provider.data.records[0].giftCard, `${tag}-A`);

      const notes = await req('GET', recordsUrl(`search=${encodeURIComponent(`gamma-${tag}`)}`), { user: admin });
      assert.equal(notes.status, 200);
      assert.equal(notes.data.records.length, 1);

      const adminNote = await req('GET', recordsUrl(`search=${encodeURIComponent(`admin-note-${tag}`)}`), { user: admin });
      assert.equal(adminNote.status, 200);
      assert.equal(adminNote.data.records.length, 1);
      assert.equal(adminNote.data.records[0].giftCard, `${tag}-C`);

      const userName = await req('GET', recordsUrl(`search=${encodeURIComponent(user.name)}`), { user: admin });
      assert.equal(userName.status, 200);
      assert.ok(userName.data.records.some((record) => record.giftCard.startsWith(tag)));

      const userEmail = await req('GET', recordsUrl(`search=${encodeURIComponent(user.email)}`), { user: admin });
      assert.equal(userEmail.status, 200);
      assert.ok(userEmail.data.records.some((record) => record.giftCard.startsWith(tag)));

      const pinSearch = await req('GET', recordsUrl(`search=${encodeURIComponent(pin)}`), { user: admin });
      assert.equal(pinSearch.status, 200);
      assert.equal(pinSearch.data.records.length, 0);
      assert.equal(pinSearch.data.summary.totalRecords, 0);
    });

    await test('sorting is whitelisted, stable, and supports amount and paid-back fields', async () => {
      const asc = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&sort=giftCardAmount&order=asc&limit=all`), { user: admin });
      assert.equal(asc.status, 200);
      assert.deepEqual(asc.data.records.map((record) => record.giftCardAmount), [50, 100, 200, 300]);

      const desc = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&sort=giftCardAmount&order=desc&limit=all`), { user: admin });
      assert.equal(desc.status, 200);
      assert.deepEqual(desc.data.records.map((record) => record.giftCardAmount), [300, 200, 100, 50]);

      const fallback = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&sort=$where&order=asc&limit=all`), { user: admin });
      assert.equal(fallback.status, 200);
      assert.equal(fallback.data.records.length, 4);
    });

    await test('pagination and the All option preserve filter totals', async () => {
      const first = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&page=1&limit=2`), { user: admin });
      assert.equal(first.status, 200);
      assert.equal(first.data.records.length, 2);
      assert.equal(first.data.pagination.total, 4);
      assert.equal(first.data.pagination.pages, 2);

      const second = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&page=2&limit=2`), { user: admin });
      assert.equal(second.status, 200);
      assert.equal(second.data.records.length, 2);
      assert.notEqual(first.data.records[0]._id, second.data.records[0]._id);

      const all = await req('GET', recordsUrl(`search=${encodeURIComponent(tag)}&limit=all`), { user: admin });
      assert.equal(all.status, 200);
      assert.equal(all.data.pagination.all, true);
      assert.equal(all.data.pagination.limit, 'all');
      assert.equal(all.data.records.length, 4);
    });

    await test('invalid user identifiers return 400 and unauthenticated access remains blocked', async () => {
      const badUser = await req('GET', recordsUrl('userId=bad-id'), { user: admin });
      assert.equal(badUser.status, 400);
      const badUsers = await req('GET', recordsUrl('userIds=bad-id'), { user: admin });
      assert.equal(badUsers.status, 400);
      const anonymous = await req('GET', recordsUrl(''));
      assert.equal(anonymous.status, 401);
    });

    await test('bulk payment and undo report success and skipped records accurately', async () => {
      const pay = await req('POST', '/api/gc-records/bulk-pay', {
        user: admin,
        body: { recordIds: [created.A._id, created.B._id, created.C._id] }
      });
      assert.equal(pay.status, 200);
      assert.equal(pay.data.results.success.length, 2);
      assert.equal(pay.data.results.skipped, 1);

      const undo = await req('POST', '/api/gc-records/bulk-undo-pay', {
        user: admin,
        body: { recordIds: [created.A._id, created.B._id, created.D._id] }
      });
      assert.equal(undo.status, 200);
      assert.equal(undo.data.results.success.length, 2);
      assert.equal(undo.data.results.skipped.length, 1);
    });

    await test('CSV and Excel exports honor filters and omit PINs', async () => {
      const csv = await req('GET', `/api/export/csv?search=${encodeURIComponent(tag)}`, { user: admin });
      assert.equal(csv.status, 200);
      assert.ok(csv.text.includes(`${tag}-A`));
      assert.ok(!csv.text.toLowerCase().includes('gift card pin'));
      assert.ok(!csv.text.includes(pin));

      const excel = await req('GET', `/api/export/excel?search=${encodeURIComponent(tag)}&status=paid_back`, { user: admin });
      assert.equal(excel.status, 200);
      const XLSX = require('xlsx');
      const workbook = XLSX.read(excel.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]['Gift Card'], `${tag}-C`);
      assert.ok(!Object.keys(rows[0]).some((key) => /pin/i.test(key)));
      assert.ok(!JSON.stringify(rows).includes(pin));
    });
  } finally {
    for (const id of createdIds) {
      await req('DELETE', `/api/gc-records/${id}`, { user: admin });
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
    process.exit(1);
  }
})();
