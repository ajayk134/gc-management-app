const assert = require('assert');
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const DB_NAME = process.env.SCHEDULER_TEST_DB || 'gc_management_scheduler_test';

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

const now = new Date('2026-06-15T12:00:00.000Z');
const at = (offsetMs) => new Date(now.getTime() + offsetMs);
const creator = new mongoose.Types.ObjectId();

(async () => {
  await mongoose.connect(uri, { dbName: DB_NAME });
  await mongoose.connection.dropDatabase();

  const Downtime = require('../models/Downtime');
  const { reconcileDowntimeStatuses } = require('../utils/downtime');

  const make = (data) => Downtime.create({
    title: 'Scheduler test',
    startAt: data.startAt,
    endAt: data.endAt,
    status: data.status,
    startedAt: data.startedAt,
    stoppedAt: data.stoppedAt,
    createdBy: creator
  });

  await test('future schedule stays scheduled', async () => {
    const item = await make({ status: 'scheduled', startAt: at(60000), endAt: at(120000) });
    await reconcileDowntimeStatuses(now);
    const refreshed = await Downtime.findById(item._id);
    assert.equal(refreshed.status, 'scheduled');
    assert.equal(refreshed.startedAt, undefined);
  });

  await test('missed start boundary activates and records the scheduled start', async () => {
    const item = await make({ status: 'scheduled', startAt: at(-60000), endAt: at(60000) });
    const result = await reconcileDowntimeStatuses(now);
    assert.ok(result.activated >= 1);
    const refreshed = await Downtime.findById(item._id);
    assert.equal(refreshed.status, 'active');
    assert.equal(refreshed.startedAt.toISOString(), item.startAt.toISOString());
  });

  await test('missed end boundary completes an open window', async () => {
    const item = await make({ status: 'scheduled', startAt: at(-120000), endAt: at(-1000) });
    const result = await reconcileDowntimeStatuses(now);
    assert.ok(result.completed >= 1);
    const refreshed = await Downtime.findById(item._id);
    assert.equal(refreshed.status, 'completed');
    assert.equal(refreshed.stoppedAt.toISOString(), item.endAt.toISOString());
  });

  await test('active window past its end is completed', async () => {
    const item = await make({ status: 'active', startAt: at(-120000), endAt: at(-1000), startedAt: at(-120000) });
    await reconcileDowntimeStatuses(now);
    const refreshed = await Downtime.findById(item._id);
    assert.equal(refreshed.status, 'completed');
  });

  await test('cancelled and completed entries are never revived', async () => {
    const cancelled = await make({ status: 'cancelled', startAt: at(-60000), endAt: at(60000) });
    const completed = await make({ status: 'completed', startAt: at(-60000), endAt: at(60000) });
    await reconcileDowntimeStatuses(now);
    assert.equal((await Downtime.findById(cancelled._id)).status, 'cancelled');
    assert.equal((await Downtime.findById(completed._id)).status, 'completed');
  });

  await test('reconciliation is idempotent across simulated restarts', async () => {
    const item = await make({ status: 'scheduled', startAt: at(-60000), endAt: at(60000) });
    await reconcileDowntimeStatuses(now);
    const first = await Downtime.findById(item._id);
    await reconcileDowntimeStatuses(now);
    await reconcileDowntimeStatuses(at(1000));
    const second = await Downtime.findById(item._id);
    assert.equal(second.status, 'active');
    assert.equal(second.startedAt.toISOString(), first.startedAt.toISOString());
  });

  await test('an open-ended active entry remains active', async () => {
    const item = await make({ status: 'active', startAt: at(-60000), endAt: null, startedAt: at(-60000) });
    await reconcileDowntimeStatuses(now);
    assert.equal((await Downtime.findById(item._id)).status, 'active');
  });

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
