const assert = require('assert');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const DB_NAME = process.env.RESTART_TEST_DB || 'gc_management_restart_test';
const PORT = process.env.RESTART_TEST_PORT || '5012';
const BASE = `http://localhost:${PORT}`;

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForHealth(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Server did not become healthy');
}

async function waitForStoredStatus(id, expected, timeoutMs = 10000) {
  const Downtime = require('../models/Downtime');
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const item = await Downtime.findById(id);
    last = item?.status;
    if (last === expected) return;
    await sleep(250);
  }
  throw new Error(`Expected stored status ${expected}, got ${last}`);
}

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MONGODB_URI: uri,
      DB_NAME,
      PORT,
      NODE_ENV: 'test'
    },
    stdio: 'ignore'
  });
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 5000);
  });
}

(async () => {
  await mongoose.connect(uri, { dbName: DB_NAME });
  await mongoose.connection.dropDatabase();

  const Downtime = require('../models/Downtime');
  const now = Date.now();
  const item = await Downtime.create({
    title: 'Restart recovery test',
    startAt: new Date(now - 20000),
    endAt: new Date(now + 60000),
    status: 'scheduled',
    createdBy: new mongoose.Types.ObjectId()
  });

  let server = startServer();

  await test('a restart activates a window whose start was missed while offline', async () => {
    await waitForHealth();
    await waitForStoredStatus(item._id, 'active');
    const status = await fetch(`${BASE}/api/downtime/status`).then(r => r.json());
    assert.equal(status.active, true);
    assert.equal(status.downtime._id, String(item._id));
  });

  await stopServer(server);

  await Downtime.findByIdAndUpdate(item._id, { endAt: new Date(Date.now() - 1000) });

  server = startServer();

  await test('a restart completes a window whose end was missed while offline', async () => {
    await waitForHealth();
    await waitForStoredStatus(item._id, 'completed');
    const status = await fetch(`${BASE}/api/downtime/status`).then(r => r.json());
    assert.equal(status.active, false);
    assert.equal(status.upcoming, null);
  });

  await stopServer(server);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`\n${f.name}\n${f.err.stack}`);
    process.exit(1);
  }
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.connection.dropDatabase(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
