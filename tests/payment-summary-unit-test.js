const assert = require('assert');
const {
  getDateKey,
  summarizeRecords,
  groupPayments,
  buildPaymentSummary,
  buildRecentActivity
} = require('../utils/paymentSummary');

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

const record = (overrides = {}) => ({
  _id: overrides._id || overrides.giftCard || 'id',
  giftCard: 'CARD',
  giftCardPin: 'SHOULD-NOT-LEAK',
  giftCardAmount: 100,
  paid: 80,
  paymentStatus: 'paid_back',
  paidBackAt: '2026-06-15T10:00:00.000Z',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-15T10:00:00.000Z',
  ...overrides
});

test('daily grouping shows record count and sum of paid amounts', () => {
  const records = [
    record({ giftCard: 'A', paid: 80, paidBackAt: '2026-06-15T10:00:00.000Z' }),
    record({ giftCard: 'B', paid: 120, giftCardAmount: 150, paidBackAt: '2026-06-15T18:00:00.000Z' }),
    record({ giftCard: 'C', paid: 50, paidBackAt: '2026-06-14T10:00:00.000Z' })
  ];
  const groups = groupPayments(records, { timeZone: 'UTC' });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, '2026-06-15');
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].totalPaid, 200);
  assert.equal(groups[0].totalGiftCardAmount, 250);
  assert.equal(groups[0].records.length, 2);
  assert.equal(groups[1].key, '2026-06-14');
  assert.equal(groups[1].totalPaid, 50);
});

test('adjusted amounts are used for paid-back totals without leaking PINs', () => {
  const summary = buildPaymentSummary([
    record({ giftCard: 'ADJ', paid: 40, adjustedAmount: 75, giftCardAmount: 100 })
  ], { timeZone: 'UTC' });
  assert.equal(summary.filtered.totalPaidBackAmount, 75);
  assert.equal(summary.groups[0].records[0].effectivePaid, 75);
  assert.equal(summary.groups[0].records[0].adjustedAmount, 75);
  assert.equal(summary.groups[0].records[0].giftCardPin, undefined);
});

test('summary totals do not double count paid-back, pending, or GC amounts', () => {
  const summary = summarizeRecords([
    record({ paymentStatus: 'paid_back', paid: 100, giftCardAmount: 120 }),
    record({ paymentStatus: 'paid_back', paid: 50, adjustedAmount: 60, giftCardAmount: 80 }),
    record({ paymentStatus: 'pending', paid: 25, giftCardAmount: 40, paidBackAt: null })
  ]);
  assert.equal(summary.totalRecords, 3);
  assert.equal(summary.totalGiftCardAmount, 240);
  assert.equal(summary.totalAmountPaid, 185);
  assert.equal(summary.totalPaidBackAmount, 160);
  assert.equal(summary.pendingAmount, 25);
  assert.equal(summary.paidBackCount, 2);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.totalPaidBackAmount + summary.pendingAmount, summary.totalAmountPaid);
});

test('time zone changes the calendar grouping at midnight boundaries', () => {
  const instant = '2026-03-01T00:30:00.000Z';
  assert.equal(getDateKey(instant, 'Asia/Kolkata'), '2026-03-01');
  assert.equal(getDateKey(instant, 'America/Los_Angeles'), '2026-02-28');
  assert.equal(getDateKey(instant, 'UTC'), '2026-03-01');

  const kolkata = groupPayments([record({ paidBackAt: instant })], { timeZone: 'Asia/Kolkata' });
  const losAngeles = groupPayments([record({ paidBackAt: instant })], { timeZone: 'America/Los_Angeles' });
  assert.equal(kolkata[0].key, '2026-03-01');
  assert.equal(losAngeles[0].key, '2026-02-28');
});

test('missing and invalid payment dates are grouped safely as unknown', () => {
  const summary = buildPaymentSummary([
    record({ giftCard: 'MISSING', paidBackAt: null }),
    record({ giftCard: 'INVALID', paidBackAt: 'not-a-date' })
  ], { timeZone: 'UTC' });
  assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0].key, 'unknown');
  assert.equal(summary.groups[0].count, 2);
  assert.equal(summary.filtered.missingPaidBackDateCount, 2);
  assert.equal(summary.allTime.missingPaidBackDateCount, 2);
});

test('date range filters are inclusive and use the requested time zone', () => {
  const records = [
    record({ giftCard: 'EARLY', paidBackAt: '2026-03-01T00:30:00.000Z' }),
    record({ giftCard: 'LATE', paidBackAt: '2026-03-01T23:30:00.000Z' }),
    record({ giftCard: 'MISSING', paidBackAt: null })
  ];
  const utc = buildPaymentSummary(records, {
    timeZone: 'UTC',
    startDate: '2026-03-01',
    endDate: '2026-03-01'
  });
  assert.equal(utc.filtered.paidBackCount, 2);

  const la = buildPaymentSummary(records, {
    timeZone: 'America/Los_Angeles',
    startDate: '2026-03-01',
    endDate: '2026-03-01'
  });
  assert.equal(la.filtered.paidBackCount, 1);
  assert.equal(la.groups[0].records[0].giftCard, 'LATE');
});

test('search and sorting apply to payment groups', () => {
  const records = [
    record({ giftCard: 'AMAZON-1', provider: 'Amazon', paid: 100, paidBackAt: '2026-06-15T10:00:00.000Z' }),
    record({ giftCard: 'FLIPKART-1', provider: 'Flipkart', paid: 30, paidBackAt: '2026-06-14T10:00:00.000Z' }),
    record({ giftCard: 'AMAZON-2', provider: 'Amazon', paid: 50, paidBackAt: '2026-06-13T10:00:00.000Z' })
  ];
  const search = buildPaymentSummary(records, { timeZone: 'UTC', search: 'amazon' });
  assert.equal(search.filtered.paidBackCount, 2);
  assert.ok(search.groups.every(group => group.records.every(item => item.provider === 'Amazon')));

  const amountSort = buildPaymentSummary(records, { timeZone: 'UTC', sort: 'amount-desc' });
  assert.equal(amountSort.groups[0].totalPaid, 100);
  const dateAsc = buildPaymentSummary(records, { timeZone: 'UTC', sort: 'date-asc' });
  assert.equal(dateAsc.groups[0].key, '2026-06-13');
});

test('pending payments are listed without invented payment dates', () => {
  const summary = buildPaymentSummary([
    record({ giftCard: 'PENDING-1', paymentStatus: 'pending', paid: 40, paidBackAt: null, createdAt: '2026-06-01T10:00:00.000Z' })
  ], { timeZone: 'UTC' });
  assert.equal(summary.groups.length, 0);
  assert.equal(summary.pending.count, 1);
  assert.equal(summary.pending.amount, 40);
  assert.equal(summary.pending.records[0].paidBackAt, null);
  assert.equal(summary.recentActivity[0].type, 'pending');
  assert.equal(summary.recentActivity[0].dateRecorded, true);
});

test('recent activity marks paid-back records without a date as unrecorded', () => {
  const events = buildRecentActivity([
    record({ giftCard: 'NO-DATE', paidBackAt: null, updatedAt: null, createdAt: null })
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'paid_back');
  assert.equal(events[0].dateRecorded, false);
  assert.equal(events[0].at, null);
});

test('empty datasets return safe zero totals and no groups', () => {
  const summary = buildPaymentSummary([], { timeZone: 'UTC' });
  assert.equal(summary.groups.length, 0);
  assert.equal(summary.filtered.paidBackCount, 0);
  assert.equal(summary.filtered.totalPaidBackAmount, 0);
  assert.equal(summary.filtered.averagePaidBack, 0);
  assert.equal(summary.pending.count, 0);
  assert.equal(summary.allTime.totalRecords, 0);
  assert.equal(summary.recentActivity.length, 0);
});

test('large datasets keep exact daily counts and grand totals', () => {
  const records = [];
  for (let day = 0; day < 60; day += 1) {
    for (let index = 0; index < 20; index += 1) {
      records.push(record({
        _id: `${day}-${index}`,
        giftCard: `LARGE-${day}-${index}`,
        giftCardAmount: 100,
        paid: 10 + index,
        paidBackAt: new Date(Date.UTC(2026, 0, 1 + day, 12, 0, 0)).toISOString()
      }));
    }
  }
  const summary = buildPaymentSummary(records, { timeZone: 'UTC' });
  assert.equal(summary.groups.length, 60);
  assert.equal(summary.filtered.paidBackCount, 1200);
  assert.equal(summary.filtered.dayCount, 60);
  assert.equal(summary.filtered.totalPaidBackAmount, 60 * 20 * 19.5);
  assert.equal(summary.groups.reduce((total, group) => total + group.count, 0), 1200);
  assert.equal(summary.groups.reduce((total, group) => total + group.totalPaid, 0), summary.filtered.totalPaidBackAmount);
});

test('invalid time zones and date formats are rejected', () => {
  assert.throws(() => buildPaymentSummary([], { timeZone: 'Not/AZone' }), /Invalid time zone/);
  assert.throws(() => buildPaymentSummary([], { timeZone: 'UTC', startDate: '15-06-2026' }), /YYYY-MM-DD/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
  process.exit(1);
}
