const assert = require('assert');
const mongoose = require('mongoose');
const {
  buildGCRecordFilterBase,
  parseGCRecordSort,
  escapeRegex
} = require('../utils/gcRecordQuery');
const {
  parseExportColumns,
  getExportHeaders,
  buildExcelRows
} = require('../utils/exportColumns');

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

const objectId = (suffix) => new mongoose.Types.ObjectId(`64b00000000000000000${String(suffix).padStart(4, '0')}`);
const userId = objectId(1);
const otherId = objectId(2);

(async () => {
  const recordQuery = await import('../client/src/utils/recordQuery.mjs');

  await test('backend filter scopes regular users to their own records and ignores userId overrides', async () => {
    const filter = buildGCRecordFilterBase({ userId: otherId.toString() }, { role: 'user', userId });
    assert.equal(filter.user.toString(), userId.toString());
  });

  await test('backend filter validates and applies admin userId and userIds', async () => {
    assert.equal(
      buildGCRecordFilterBase({ userId: otherId.toString() }, { role: 'admin' }).user.toString(),
      otherId.toString()
    );
    const many = buildGCRecordFilterBase({ userIds: `${userId},${otherId}` }, { role: 'admin' });
    assert.equal(many.user.$in.length, 2);

    assert.throws(
      () => buildGCRecordFilterBase({ userId: 'not-an-id' }, { role: 'admin' }),
      (err) => err.status === 400 && /Invalid userId/.test(err.message)
    );
    assert.throws(
      () => buildGCRecordFilterBase({ userIds: `${userId},bad` }, { role: 'admin' }),
      (err) => err.status === 400 && /Invalid userIds/.test(err.message)
    );
  });

  await test('backend filter combines status, sharing, dates, amounts, and search without PIN fields', async () => {
    const filter = buildGCRecordFilterBase({
      status: 'pending',
      shared: 'unshared',
      startDate: '2026-01-02',
      endDate: '2026-01-04',
      paidBackStartDate: '2026-02-03',
      paidBackEndDate: '2026-02-05',
      minAmount: '10',
      maxAmount: '99.5',
      search: 'amazon.*'
    }, { role: 'admin' });

    assert.equal(filter.paymentStatus, 'pending');
    assert.deepEqual(filter.shared, { $ne: true });
    assert.equal(filter.createdAt.$gte.toISOString(), '2026-01-02T00:00:00.000Z');
    assert.equal(filter.createdAt.$lte.toISOString(), '2026-01-04T23:59:59.999Z');
    assert.equal(filter.paidBackAt.$gte.toISOString(), '2026-02-03T00:00:00.000Z');
    assert.equal(filter.paidBackAt.$lte.toISOString(), '2026-02-05T23:59:59.999Z');
    assert.equal(filter.giftCardAmount.$gte, 10);
    assert.equal(filter.giftCardAmount.$lte, 99.5);

    const searchClauses = filter.$or.map((clause) => Object.keys(clause)[0]).sort();
    assert.deepEqual(searchClauses, ['adminNote', 'giftCard', 'notes', 'provider']);
    assert.ok(!filter.$or.some((clause) => Object.prototype.hasOwnProperty.call(clause, 'giftCardPin')));
    assert.equal(filter.$or[0].giftCard.source, 'amazon\\.\\*');
  });

  await test('backend filter maps shared=true and open-ended ranges safely', async () => {
    const filter = buildGCRecordFilterBase({ shared: 'shared', startDate: '2026-03-01' }, { role: 'admin' });
    assert.equal(filter.shared, true);
    assert.ok(filter.createdAt.$gte);
    assert.ok(!filter.createdAt.$lte);
  });

  await test('backend sort only accepts whitelisted fields and always adds a stable tiebreaker', async () => {
    assert.deepEqual(parseGCRecordSort({ sort: 'giftCardAmount', order: 'asc' }), { giftCardAmount: 1, _id: 1 });
    assert.deepEqual(parseGCRecordSort({ sort: 'paidBackAt', order: 'desc' }), { paidBackAt: -1, _id: -1 });
    assert.deepEqual(parseGCRecordSort({ sort: '$where' }), { createdAt: -1, _id: -1 });
  });

  await test('search regex escaping neutralizes regex operators', async () => {
    assert.equal(escapeRegex('a+b(c)[d]?'), 'a\\+b\\(c\\)\\[d\\]\\?');
  });

  await test('frontend query builder serializes filters and omits paging for exports', async () => {
    const params = recordQuery.buildRecordQuery({
      search: '  amazon  ',
      status: 'pending',
      filters: {
        userId,
        shared: 'shared',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        paidBackStartDate: '2026-02-01',
        paidBackEndDate: '2026-02-28',
        minAmount: '100',
        maxAmount: '500'
      },
      sort: { field: 'giftCardAmount', order: 'asc' },
      page: 3,
      pageSize: 20
    });
    assert.equal(params.get('search'), 'amazon');
    assert.equal(params.get('status'), 'pending');
    assert.equal(params.get('userId'), userId.toString());
    assert.equal(params.get('paidBackStartDate'), '2026-02-01');
    assert.equal(params.get('minAmount'), '100');
    assert.equal(params.get('sort'), 'giftCardAmount');
    assert.equal(params.get('order'), 'asc');
    assert.equal(params.get('page'), '3');
    assert.equal(params.get('limit'), '20');

    const exportParams = recordQuery.buildRecordQuery({ search: 'x', includePaging: false });
    assert.equal(exportParams.get('page'), null);
    assert.equal(exportParams.get('limit'), null);

    const allParams = recordQuery.buildRecordQuery({ pageSize: 'all', includePaging: true });
    assert.equal(allParams.get('limit'), 'all');
  });

  await test('active filter count and chips cover search, status, user, sharing, dates, and amount', async () => {
    const filters = {
      userId: userId.toString(),
      shared: 'unshared',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      paidBackStartDate: '2026-02-01',
      paidBackEndDate: '2026-02-02',
      minAmount: '50',
      maxAmount: '75'
    };
    const state = { search: 'amazon', status: 'paid_back', filters };
    assert.equal(recordQuery.countActiveFilters(state), 10);

    const chips = recordQuery.buildFilterChips({ ...state, users: [{ _id: userId, name: 'Test User' }] });
    assert.equal(chips.length, 7);
    assert.ok(chips.find((chip) => chip.key === 'search').label.includes('amazon'));
    assert.ok(chips.find((chip) => chip.key === 'userId').label.includes('Test User'));
    assert.ok(chips.find((chip) => chip.key === 'amount').label.includes('₹'));
    assert.ok(!JSON.stringify(chips).toLowerCase().includes('pin'));
  });

  await test('presets map to clean filter state and detect the active preset', async () => {
    const now = new Date('2026-06-30T12:00:00Z');
    const recent = recordQuery.presetToState('recent', now);
    assert.equal(recent.filters.startDate, '2026-05-31');
    assert.equal(recordQuery.detectPreset(recent, now), 'recent');
    assert.equal(recordQuery.detectPreset({ search: 'x', status: '', filters: recordQuery.DEFAULT_FILTERS }, now), null);
    assert.equal(recordQuery.detectPreset({ search: '', status: 'pending', filters: recordQuery.DEFAULT_FILTERS }, now), 'pending');
    assert.equal(recordQuery.detectPreset({ search: '', status: '', filters: recordQuery.DEFAULT_FILTERS }, now), 'all');
  });

  await test('column preferences merge safely and fall back on invalid storage', async () => {
    const defaults = recordQuery.parseColumnPrefs(null);
    assert.equal(defaults.user, true);
    assert.equal(defaults.pin, true);
    assert.equal(defaults.notes, false);

    const merged = recordQuery.parseColumnPrefs(JSON.stringify({ notes: true, user: false, hacked: true }));
    assert.equal(merged.notes, true);
    assert.equal(merged.user, false);
    assert.equal(merged.hacked, undefined);

    assert.deepEqual(recordQuery.parseColumnPrefs('{bad json'), recordQuery.DEFAULT_COLUMNS);
    assert.equal(recordQuery.visibleColumns({ notes: true }).notes, true);
  });

  await test('visible column keys preserve table order and exclude hidden columns', async () => {
    const keys = recordQuery.visibleColumnKeys({
      user: true,
      provider: false,
      amount: true,
      paid: false,
      status: true,
      shared: false,
      submitted: true,
      paidBack: false,
      notes: true
    });
    assert.deepEqual(keys, ['user', 'pin', 'amount', 'status', 'submitted', 'notes']);
    assert.deepEqual(recordQuery.visibleColumnKeys({ notes: true }), [
      'user', 'pin', 'provider', 'amount', 'paid', 'status', 'shared', 'submitted', 'paidBack', 'notes'
    ]);
  });

  await test('Excel columns follow the selected groups, keep table order, and omit hidden columns', async () => {
    const record = {
      giftCard: 'GC-1',
      giftCardPin: 'PIN-UNIT-1',
      giftCardAmount: 500,
      paid: 350,
      adjustedAmount: 400,
      provider: 'Amazon',
      paymentStatus: 'paid_back',
      shared: true,
      createdAt: new Date('2026-01-02T10:00:00.000Z'),
      paidBackAt: new Date('2026-01-03T10:00:00.000Z'),
      notes: 'sample note',
      adminNote: 'admin note',
      user: { name: 'Test User', email: 'test@example.com' }
    };

    assert.deepEqual(parseExportColumns('user,provider,notes'), ['user', 'giftCard', 'provider', 'notes']);
    assert.deepEqual(getExportHeaders('user,provider,notes'), [
      'User', 'Email', 'Gift Card', 'Provider', 'Notes', 'Admin Note'
    ]);
    assert.deepEqual(getExportHeaders(''), ['Gift Card']);
    assert.deepEqual(getExportHeaders('unknown'), ['Gift Card']);

    const rows = buildExcelRows([record], 'user,provider,notes');
    assert.deepEqual(Object.keys(rows[0]), ['User', 'Email', 'Gift Card', 'Provider', 'Notes', 'Admin Note']);
    assert.equal(rows[0].User, 'Test User');
    assert.equal(rows[0].Email, 'test@example.com');
    assert.equal(rows[0]['Gift Card'], 'GC-1');
    assert.equal(rows[0].Provider, 'Amazon');
    assert.equal(rows[0].Notes, 'sample note');
    assert.ok(!('Payment Status' in rows[0]));
    assert.ok(!('Gift Card Amount' in rows[0]));
    assert.ok(!('Gift Card PIN' in rows[0]));
    assert.ok(!JSON.stringify(rows).includes('PIN-UNIT-1'));
  });

  await test('Excel export includes PIN only when its column is selected and keeps table order', async () => {
    const record = {
      giftCard: 'GC-1',
      giftCardPin: 'PIN-UNIT-1',
      giftCardAmount: 500,
      paid: 350,
      provider: 'Amazon',
      user: { name: 'Test User', email: 'test@example.com' }
    };

    assert.deepEqual(parseExportColumns('pin'), ['giftCard', 'pin']);
    assert.deepEqual(getExportHeaders('user,pin,provider'), [
      'User', 'Email', 'Gift Card', 'Gift Card PIN', 'Provider'
    ]);
    const rows = buildExcelRows([record], 'user,pin,provider');
    assert.deepEqual(Object.keys(rows[0]), [
      'User', 'Email', 'Gift Card', 'Gift Card PIN', 'Provider'
    ]);
    assert.equal(rows[0]['Gift Card PIN'], 'PIN-UNIT-1');
  });

  await test('full Excel export keeps all existing columns in table order', async () => {
    assert.deepEqual(getExportHeaders(), [
      'User', 'Email', 'Gift Card', 'Gift Card PIN', 'Provider', 'Gift Card Amount',
      'Adjusted Amount', 'Paid (Original)', 'Payment Status', 'Shared',
      'Submitted At', 'Paid Back At', 'Notes', 'Admin Note'
    ]);
  });

  await test('bulk result counts support arrays and numeric skipped values', async () => {
    assert.deepEqual(recordQuery.getResultCounts({
      success: ['a', 'b'],
      skipped: 2,
      failed: [{ id: 'c' }]
    }), { success: 2, skipped: 2, failed: 1 });
    assert.deepEqual(recordQuery.getResultCounts(null), { success: 0, skipped: 0, failed: 0 });
  });

  await test('pagination items keep first/last pages and insert gap markers', async () => {
    assert.deepEqual(recordQuery.getPageItems(1, 0), []);
    assert.deepEqual(recordQuery.getPageItems(1, 1), [1]);
    assert.deepEqual(recordQuery.getPageItems(4, 6), [1, 2, 3, 4, 5, 6]);
    const items = recordQuery.getPageItems(10, 20);
    assert.equal(items[0], 1);
    assert.equal(items[items.length - 1], 20);
    assert.ok(items.includes(10));
    assert.ok(items.some((item) => typeof item === 'string' && item.startsWith('gap-')));
  });

  await test('sort value helpers round-trip whitelisted options', async () => {
    const state = recordQuery.sortValueToState('paidBackAt:asc');
    assert.deepEqual(state, { field: 'paidBackAt', order: 'asc' });
    assert.equal(recordQuery.sortStateToValue(state), 'paidBackAt:asc');
    assert.equal(recordQuery.getSortLabel(state), 'Paid back: oldest first');
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
    process.exit(1);
  }
})();
