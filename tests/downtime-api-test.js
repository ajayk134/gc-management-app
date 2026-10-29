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

(async () => {
  assert.ok(ADMIN_EMAIL && ADMIN_PASSWORD && USER_EMAIL && USER_PASSWORD, 'TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_USER_EMAIL and TEST_USER_PASSWORD are required');
  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal(adminLogin.status, 200);
  const admin = adminLogin.data.user;

  const userLogin = await login(USER_EMAIL, USER_PASSWORD);
  assert.equal(userLogin.status, 200);
  const user = userLogin.data.user;

  async function currentDowntimes() {
    const r = await req('GET', '/api/downtime', { user: admin });
    assert.equal(r.status, 200);
    return r.data.downtimes;
  }

  async function cleanup() {
    await req('PUT', '/api/downtime', { user: admin, body: { enabled: false } });
    const list = await currentDowntimes();
    for (const item of list) {
      if (item.status === 'active') {
        await req('POST', `/api/downtime/${item._id}/stop`, { user: admin });
      } else if (item.status === 'scheduled') {
        await req('POST', `/api/downtime/${item._id}/cancel`, { user: admin });
      }
    }
    const latest = await currentDowntimes();
    for (const item of latest) {
      if (['completed', 'cancelled'].includes(item.status)) {
        await req('DELETE', `/api/downtime/${item._id}`, { user: admin });
      }
    }
  }

  await cleanup();

  await test('public maintenance status is available without authentication', async () => {
    const r = await req('GET', '/api/downtime/status');
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.active, 'boolean');
    assert.equal(r.data.active, false);
    assert.ok(r.data.serverTime);
  });

  await test('regular users cannot enable or disable maintenance mode', async () => {
    const list = await req('GET', '/api/downtime', { user });
    assert.equal(list.status, 403);
    const toggle = await req('PUT', '/api/downtime', { user, body: { enabled: true } });
    assert.equal(toggle.status, 403);
    const toggleAlias = await req('POST', '/api/downtime/toggle', { user, body: { enabled: true } });
    assert.equal(toggleAlias.status, 403);
  });

  await test('admin toggle requires an explicit boolean state', async () => {
    const r = await req('PUT', '/api/downtime', { user: admin, body: {} });
    assert.equal(r.status, 400);
  });

  await test('admin can enable maintenance mode immediately', async () => {
    const r = await req('PUT', '/api/downtime', { user: admin, body: { enabled: true } });
    assert.equal(r.status, 200);
    assert.equal(r.data.active, true);
    assert.equal(r.data.current.status, 'active');
    assert.equal(r.data.current.endAt, null);
    assert.ok(r.data.current.message);

    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.active, true);
    assert.equal(status.data.enabled, true);
    assert.ok(status.data.message);
  });

  await test('login and all read-only user APIs remain available during maintenance', async () => {
    const loginDuring = await login(USER_EMAIL, USER_PASSWORD);
    assert.equal(loginDuring.status, 200);

    for (const path of ['/api/auth/me', '/api/gc-records', '/api/stats/user', '/api/providers']) {
      const r = await req('GET', path, { user });
      assert.equal(r.status, 200, `${path} should remain readable`);
    }

    const adminUsers = await req('GET', '/api/users', { user: admin });
    assert.equal(adminUsers.status, 200);
    const adminRecords = await req('GET', '/api/gc-records', { user: admin });
    assert.equal(adminRecords.status, 200);
  });

  await test('creating a new gift card record is blocked for regular users', async () => {
    const r = await req('POST', '/api/gc-records', {
      user,
      body: { giftCard: 'BLOCKED-' + Date.now(), giftCardPin: '0000', giftCardAmount: 100, paid: 80, provider: 'Flipkart' }
    });
    assert.equal(r.status, 503);
    assert.equal(r.data.code, 'DOWNTIME_ACTIVE');
    assert.ok(r.data.downtime);
  });

  await test('creating a new gift card record is blocked for administrators too', async () => {
    const r = await req('POST', '/api/gc-records', {
      user: admin,
      body: { userId: user.id || user._id, giftCard: 'BLOCKED-ADMIN-' + Date.now(), giftCardPin: '0001', giftCardAmount: 100, paid: 80, provider: 'Flipkart' }
    });
    assert.equal(r.status, 503);
    assert.equal(r.data.code, 'DOWNTIME_ACTIVE');
  });

  await test('admin can disable maintenance mode and creation works again', async () => {
    const off = await req('PUT', '/api/downtime', { user: admin, body: { enabled: false } });
    assert.equal(off.status, 200);
    assert.equal(off.data.active, false);

    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.active, false);

    const card = 'ALLOWED-' + Date.now();
    const created = await req('POST', '/api/gc-records', {
      user,
      body: { giftCard: card, giftCardPin: '1234', giftCardAmount: 250, paid: 200, provider: 'Amazon' }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.record.giftCard, card);

    const list = await req('GET', '/api/gc-records?search=' + encodeURIComponent(card), { user });
    assert.equal(list.status, 200);
    assert.ok(list.data.records.some(r => r.giftCard === card));

    await req('DELETE', `/api/gc-records/${created.data.record._id}`, { user: admin });
  });

  await test('toggle is idempotent and persists in the downtime collection', async () => {
    const first = await req('PUT', '/api/downtime', { user: admin, body: { enabled: true } });
    assert.equal(first.status, 200);
    const second = await req('PUT', '/api/downtime', { user: admin, body: { enabled: true } });
    assert.equal(second.status, 200);
    assert.equal(second.data.current._id, first.data.current._id);

    const list = await req('GET', '/api/downtime', { user: admin });
    const activeItems = list.data.downtimes.filter(d => d.status === 'active');
    assert.equal(activeItems.length, 1);

    await req('PUT', '/api/downtime', { user: admin, body: { enabled: false } });
    const after = await req('GET', '/api/downtime', { user: admin });
    assert.equal(after.data.active, false);
    assert.equal(after.data.downtimes.filter(d => d.status === 'active').length, 0);
  });

  await test('maintenance actions are recorded in the audit log', async () => {
    const r = await req('GET', '/api/audit?action=downtime_started&limit=20', { user: admin });
    assert.equal(r.status, 200);
    assert.ok(r.data.logs.length >= 1);
    assert.ok(r.data.logs.every(l => l.action === 'downtime_started'));
  });

  await cleanup();

  await test('status is clear after cleanup', async () => {
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.active, false);
    assert.equal(status.data.upcoming, null);
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`\n${f.name}\n${f.err.stack}`);
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
