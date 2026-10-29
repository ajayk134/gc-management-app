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

  const hour = 60 * 60 * 1000;

  async function createWindow(overrides = {}) {
    const start = overrides.startAt || new Date(Date.now() + hour).toISOString();
    const end = overrides.endAt || new Date(Date.now() + 2 * hour).toISOString();
    return req('POST', '/api/downtime', {
      user: admin,
      body: {
        title: overrides.title || 'API test maintenance',
        message: overrides.message || 'API test window',
        startAt: start,
        endAt: end
      }
    });
  }

  async function removeWindow(item) {
    if (!item) return;
    if (item.status === 'scheduled') await req('POST', `/api/downtime/${item._id}/cancel`, { user: admin });
    if (item.status === 'active') await req('POST', `/api/downtime/${item._id}/stop`, { user: admin });
    await req('DELETE', `/api/downtime/${item._id}`, { user: admin });
  }

  await test('admin can schedule a future maintenance window', async () => {
    const window = await createWindow({ title: 'Scheduled API window' });
    assert.equal(window.status, 201);
    assert.equal(window.data.downtime.status, 'scheduled');
    assert.equal(window.data.downtime.title, 'Scheduled API window');

    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.active, false);
    assert.equal(status.data.upcoming._id, window.data.downtime._id);

    const forbidden = await req('GET', '/api/downtime', { user });
    assert.equal(forbidden.status, 403);

    await removeWindow(window.data.downtime);
  });

  await test('invalid date ranges and missing values are rejected', async () => {
    const inverted = await createWindow({
      startAt: new Date(Date.now() + 2 * hour).toISOString(),
      endAt: new Date(Date.now() + hour).toISOString()
    });
    assert.equal(inverted.status, 400);

    const expired = await createWindow({
      startAt: new Date(Date.now() - 2 * hour).toISOString(),
      endAt: new Date(Date.now() - hour).toISOString()
    });
    assert.equal(expired.status, 400);

    const missing = await req('POST', '/api/downtime', { user: admin, body: { title: 'Missing dates' } });
    assert.equal(missing.status, 400);
  });

  await test('overlapping scheduled windows are rejected while adjacent windows are allowed', async () => {
    const baseStart = Date.now() + 3 * hour;
    const first = await createWindow({
      title: 'Overlap base',
      startAt: new Date(baseStart).toISOString(),
      endAt: new Date(baseStart + hour).toISOString()
    });
    assert.equal(first.status, 201);

    const overlap = await createWindow({
      title: 'Overlap conflict',
      startAt: new Date(baseStart + 30 * 60 * 1000).toISOString(),
      endAt: new Date(baseStart + 2 * hour).toISOString()
    });
    assert.equal(overlap.status, 409);

    const adjacent = await createWindow({
      title: 'Adjacent window',
      startAt: new Date(baseStart + hour).toISOString(),
      endAt: new Date(baseStart + 2 * hour).toISOString()
    });
    assert.equal(adjacent.status, 201);

    await removeWindow(first.data.downtime);
    await removeWindow(adjacent.data.downtime);
  });

  await test('admin can edit and reschedule a scheduled window', async () => {
    const window = await createWindow({ title: 'Original title' });
    assert.equal(window.status, 201);

    const newStart = Date.now() + 5 * hour;
    const newEnd = newStart + 90 * 60 * 1000;
    const updated = await req('PUT', `/api/downtime/${window.data.downtime._id}`, {
      user: admin,
      body: {
        title: 'Rescheduled title',
        message: 'Updated message',
        startAt: new Date(newStart).toISOString(),
        endAt: new Date(newEnd).toISOString()
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.downtime.title, 'Rescheduled title');
    assert.equal(updated.data.downtime.message, 'Updated message');
    assert.equal(new Date(updated.data.downtime.startAt).getTime(), newStart);
    assert.equal(updated.data.downtime.status, 'scheduled');

    await removeWindow(updated.data.downtime);
  });

  await test('editing validates ranges and prevents overlaps', async () => {
    const first = await createWindow({ title: 'Edit validation A' });
    const second = await createWindow({
      title: 'Edit validation B',
      startAt: new Date(Date.now() + 4 * hour).toISOString(),
      endAt: new Date(Date.now() + 5 * hour).toISOString()
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const inverted = await req('PUT', `/api/downtime/${first.data.downtime._id}`, {
      user: admin,
      body: {
        startAt: new Date(Date.now() + 2 * hour).toISOString(),
        endAt: new Date(Date.now() + hour).toISOString()
      }
    });
    assert.equal(inverted.status, 400);

    const conflict = await req('PUT', `/api/downtime/${first.data.downtime._id}`, {
      user: admin,
      body: {
        startAt: second.data.downtime.startAt,
        endAt: second.data.downtime.endAt
      }
    });
    assert.equal(conflict.status, 409);

    await removeWindow(first.data.downtime);
    await removeWindow(second.data.downtime);
  });

  await test('timezone offsets are normalized to the same instant', async () => {
    const target = new Date(Date.now() + 6 * hour);
    const targetMs = target.getTime();
    const offsetDate = new Date(targetMs + 5.5 * hour).toISOString().slice(0, 19) + '+05:30';
    const end = new Date(targetMs + hour).toISOString();

    const window = await createWindow({ title: 'Timezone window', startAt: offsetDate, endAt: end });
    assert.equal(window.status, 201);
    assert.ok(Math.abs(new Date(window.data.downtime.startAt).getTime() - targetMs) < 1000);

    await removeWindow(window.data.downtime);
  });

  await test('scheduled window activates and expires automatically with creation blocked then restored', async () => {
    const startMs = Date.now() + 2000;
    const endMs = Date.now() + 7000;
    const window = await createWindow({
      title: 'Short automatic window',
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString()
    });
    assert.equal(window.status, 201);
    assert.equal(window.data.downtime.status, 'scheduled');

    let active = false;
    const activeDeadline = startMs + 5000;
    while (Date.now() < activeDeadline) {
      const status = await req('GET', '/api/downtime/status');
      if (status.data.active) {
        active = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    assert.equal(active, true, 'window should become active at its start time');

    const blocked = await req('POST', '/api/gc-records', {
      user,
      body: { giftCard: 'AUTO-BLOCKED-' + Date.now(), giftCardPin: '4242', giftCardAmount: 100, paid: 80, provider: 'Flipkart' }
    });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, 'DOWNTIME_ACTIVE');

    let restored = false;
    const endDeadline = endMs + 8000;
    while (Date.now() < endDeadline) {
      const status = await req('GET', '/api/downtime/status');
      if (!status.data.active) {
        restored = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(restored, true, 'window should expire at its end time');

    const card = 'AUTO-ALLOWED-' + Date.now();
    const created = await req('POST', '/api/gc-records', {
      user,
      body: { giftCard: card, giftCardPin: '4243', giftCardAmount: 120, paid: 100, provider: 'Amazon' }
    });
    assert.equal(created.status, 201);
    await req('DELETE', `/api/gc-records/${created.data.record._id}`, { user: admin });

    const refreshed = await req('GET', '/api/downtime', { user: admin });
    const expired = refreshed.data.downtimes.find(d => String(d._id) === String(window.data.downtime._id));
    assert.ok(expired);
    assert.equal(expired.status, 'completed');
  });

  await test('admin can start a scheduled window manually and end it manually', async () => {
    const window = await createWindow({
      title: 'Manual control window',
      startAt: new Date(Date.now() + hour).toISOString(),
      endAt: new Date(Date.now() + 2 * hour).toISOString()
    });
    assert.equal(window.status, 201);

    const started = await req('POST', `/api/downtime/${window.data.downtime._id}/start`, { user: admin });
    assert.equal(started.status, 200);
    assert.equal(started.data.downtime.status, 'active');

    const stopped = await req('POST', `/api/downtime/${window.data.downtime._id}/stop`, { user: admin });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.data.downtime.status, 'completed');

    await removeWindow(stopped.data.downtime);
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
