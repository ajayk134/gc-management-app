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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

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
    const list = await currentDowntimes();
    for (const item of list) {
      if (item.status === 'active') {
        await req('POST', `/api/downtime/${item._id}/stop`, { user: admin });
      } else if (item.status === 'scheduled') {
        await req('POST', `/api/downtime/${item._id}/cancel`, { user: admin });
      }
      const latest = await currentDowntimes();
      const saved = latest.find(d => d._id === item._id);
      if (saved && ['completed', 'cancelled'].includes(saved.status)) {
        await req('DELETE', `/api/downtime/${item._id}`, { user: admin });
      }
    }
  }

  await cleanup();

  await test('public downtime status is available without authentication', async () => {
    const r = await req('GET', '/api/downtime/status');
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.active, 'boolean');
    assert.ok(r.data.serverTime);
  });

  await test('regular users cannot access downtime administration', async () => {
    const list = await req('GET', '/api/downtime', { user });
    assert.equal(list.status, 403);
    const create = await req('POST', '/api/downtime', { user, body: { startAt: iso(3600000), endAt: iso(7200000) } });
    assert.equal(create.status, 403);
  });

  await test('admin can schedule future downtime and it appears as upcoming', async () => {
    const r = await req('POST', '/api/downtime', {
      user: admin,
      body: { title: 'API Test Window', message: 'Integration test maintenance', startAt: iso(2 * 60 * 60 * 1000), endAt: iso(3 * 60 * 60 * 1000) }
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.downtime.status, 'scheduled');
    assert.equal(r.data.downtime.title, 'API Test Window');
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.active, false);
    assert.equal(status.data.upcoming._id, r.data.downtime._id);
  });

  await test('overlapping downtime windows are rejected', async () => {
    const r = await req('POST', '/api/downtime', {
      user: admin,
      body: { startAt: iso(2.5 * 60 * 60 * 1000), endAt: iso(4 * 60 * 60 * 1000) }
    });
    assert.equal(r.status, 409);
  });

  await test('invalid downtime windows are rejected', async () => {
    const inverted = await req('POST', '/api/downtime', {
      user: admin,
      body: { startAt: iso(3 * 60 * 60 * 1000), endAt: iso(2 * 60 * 60 * 1000) }
    });
    assert.equal(inverted.status, 400);
    const missing = await req('POST', '/api/downtime', { user: admin, body: {} });
    assert.equal(missing.status, 400);
    const past = await req('POST', '/api/downtime', {
      user: admin,
      body: { startAt: iso(-2 * 60 * 60 * 1000), endAt: iso(-60 * 60 * 1000) }
    });
    assert.equal(past.status, 400);
  });

  let scheduled;
  let immediate;

  await test('scheduled downtime can be started immediately', async () => {
    const list = await currentDowntimes();
    scheduled = list.find(d => d.title === 'API Test Window');
    assert.ok(scheduled);
    const r = await req('POST', `/api/downtime/${scheduled._id}/start`, { user: admin });
    assert.equal(r.status, 200);
    assert.equal(r.data.downtime.status, 'active');
    assert.ok(r.data.downtime.startedAt);
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.active, true);
    assert.equal(status.data.downtime._id, scheduled._id);
  });

  await test('active downtime blocks regular user APIs but allows login and admin access', async () => {
    for (const path of ['/api/gc-records', '/api/stats/user', '/api/providers', '/api/auth/me']) {
      const r = await req('GET', path, { user });
      assert.equal(r.status, 503, `${path} should be blocked`);
      assert.equal(r.data.code, 'DOWNTIME_ACTIVE');
      assert.ok(r.data.downtime);
    }
    const userLoginDuringDowntime = await login(USER_EMAIL, USER_PASSWORD);
    assert.equal(userLoginDuringDowntime.status, 200);
    const adminUsers = await req('GET', '/api/users', { user: admin });
    assert.equal(adminUsers.status, 200);
    const adminRecords = await req('GET', '/api/gc-records', { user: admin });
    assert.equal(adminRecords.status, 200);
  });

  await test('active downtime can be stopped early and access is restored', async () => {
    const r = await req('POST', `/api/downtime/${scheduled._id}/stop`, { user: admin });
    assert.equal(r.status, 200);
    assert.equal(r.data.downtime.status, 'completed');
    assert.ok(r.data.downtime.stoppedAt);
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.active, false);
    const userRecords = await req('GET', '/api/gc-records', { user });
    assert.equal(userRecords.status, 200);
  });

  await test('admin can create downtime that starts immediately', async () => {
    const r = await req('POST', '/api/downtime', {
      user: admin,
      body: { title: 'Immediate Window', message: 'Starting now', startAt: iso(-1000), endAt: iso(5 * 60 * 1000) }
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.downtime.status, 'active');
    immediate = r.data.downtime;
    const blocked = await req('GET', '/api/gc-records', { user });
    assert.equal(blocked.status, 503);
    const stop = await req('POST', `/api/downtime/${immediate._id}/stop`, { user: admin });
    assert.equal(stop.status, 200);
  });

  await test('future scheduled downtime can be cancelled', async () => {
    const created = await req('POST', '/api/downtime', {
      user: admin,
      body: { title: 'Cancel Me', startAt: iso(6 * 60 * 60 * 1000), endAt: iso(7 * 60 * 60 * 1000) }
    });
    assert.equal(created.status, 201);
    const cancelled = await req('POST', `/api/downtime/${created.data.downtime._id}/cancel`, { user: admin });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.downtime.status, 'cancelled');
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.upcoming, null);
  });

  await test('downtime activates automatically when its start time arrives', async () => {
    const created = await req('POST', '/api/downtime', {
      user: admin,
      body: { title: 'Auto Activate', startAt: iso(1500), endAt: iso(60 * 1000) }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.downtime.status, 'scheduled');
    await sleep(2300);
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.active, true);
    assert.equal(status.data.downtime._id, created.data.downtime._id);
    const blocked = await req('GET', '/api/gc-records', { user });
    assert.equal(blocked.status, 503);
    await req('POST', `/api/downtime/${created.data.downtime._id}/stop`, { user: admin });
  });

  await test('downtime expires automatically when its end time passes', async () => {
    const created = await req('POST', '/api/downtime', {
      user: admin,
      body: { title: 'Auto Expire', startAt: iso(-1000), endAt: iso(1200) }
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.downtime.status, 'active');
    await sleep(2000);
    const status = await req('GET', '/api/downtime/status');
    assert.equal(status.data.active, false);
    const userRecords = await req('GET', '/api/gc-records', { user });
    assert.equal(userRecords.status, 200);
  });

  await test('completed and cancelled entries can be deleted but active entries cannot', async () => {
    const created = await req('POST', '/api/downtime', {
      user: admin,
      body: { title: 'Deletion Guard', startAt: iso(-1000), endAt: iso(60 * 1000) }
    });
    assert.equal(created.status, 201);
    const blockedDelete = await req('DELETE', `/api/downtime/${created.data.downtime._id}`, { user: admin });
    assert.equal(blockedDelete.status, 400);
    await req('POST', `/api/downtime/${created.data.downtime._id}/stop`, { user: admin });
    const allowedDelete = await req('DELETE', `/api/downtime/${created.data.downtime._id}`, { user: admin });
    assert.equal(allowedDelete.status, 200);
  });

  await test('invalid and missing downtime IDs are handled safely', async () => {
    const bad = await req('POST', '/api/downtime/not-an-id/stop', { user: admin });
    assert.equal(bad.status, 400);
    const missing = await req('POST', '/api/downtime/000000000000000000000000/stop', { user: admin });
    assert.equal(missing.status, 404);
  });

  await test('downtime actions are recorded in the audit log', async () => {
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
