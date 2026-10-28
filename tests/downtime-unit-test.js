const assert = require('assert');
const {
  effectiveStatus,
  serializeDowntime,
  downtimeWindowError
} = require('../utils/downtime');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

const now = new Date('2026-06-15T12:00:00.000Z');
const at = (offsetMs) => new Date(now.getTime() + offsetMs);

test('future window is scheduled', () => {
  const item = { status: 'scheduled', startAt: at(60000), endAt: at(120000) };
  assert.equal(effectiveStatus(item, now), 'scheduled');
});

test('window containing now is active even when stored as scheduled', () => {
  const item = { status: 'scheduled', startAt: at(-60000), endAt: at(60000) };
  assert.equal(effectiveStatus(item, now), 'active');
});

test('window whose end has passed is completed even when stored as active', () => {
  const item = { status: 'active', startAt: at(-120000), endAt: at(-1000) };
  assert.equal(effectiveStatus(item, now), 'completed');
});

test('exactly at start is active and exactly at end is completed', () => {
  assert.equal(effectiveStatus({ status: 'scheduled', startAt: now, endAt: at(1000) }, now), 'active');
  assert.equal(effectiveStatus({ status: 'active', startAt: at(-1000), endAt: now }, now), 'completed');
});

test('cancelled and completed statuses are terminal', () => {
  assert.equal(effectiveStatus({ status: 'cancelled', startAt: at(-1000), endAt: at(1000) }, now), 'cancelled');
  assert.equal(effectiveStatus({ status: 'completed', startAt: at(-1000), endAt: at(1000) }, now), 'completed');
});

test('serializeDowntime computes effective status without mutating stored status', () => {
  const item = { status: 'scheduled', startAt: at(-60000), endAt: at(60000), toObject: () => ({ status: 'scheduled', startAt: at(-60000), endAt: at(60000) }) };
  const serialized = serializeDowntime(item, now);
  assert.equal(serialized.status, 'active');
  assert.equal(item.status, 'scheduled');
});

test('window validation rejects missing, inverted, and expired windows', () => {
  const realNow = Date.now();
  assert.ok(downtimeWindowError(null, new Date(realNow + 1000)));
  assert.ok(downtimeWindowError(new Date(realNow + 2000), new Date(realNow + 1000)));
  assert.ok(downtimeWindowError(new Date(realNow - 2000), new Date(realNow - 1000)));
  assert.equal(downtimeWindowError(new Date(realNow + 1000), new Date(realNow + 2000)), null);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`\n${f.name}\n${f.err.stack}`);
  process.exit(1);
}
