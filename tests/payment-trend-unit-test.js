const assert = require('assert');

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

const group = (key, totalPaid, count = 1) => ({
  key,
  totalPaid,
  count,
  totalGiftCardAmount: totalPaid,
  records: []
});

(async () => {
  const {
    buildNiceScale,
    buildTrendSeries,
    startOfWeekKey
  } = await import('../client/src/utils/paymentTrend.mjs');

  test('daily aggregation sums totals, records, and payment days in date order', () => {
    const chart = buildTrendSeries([
      group('2026-06-16', 50, 1),
      group('2026-06-15', 80, 2),
      group('2026-06-15', 20, 1)
    ], 'daily', 'all');

    assert.deepEqual(chart.series.map(item => item.key), ['2026-06-15', '2026-06-16']);
    assert.equal(chart.series[0].total, 100);
    assert.equal(chart.series[0].count, 3);
    assert.equal(chart.series[0].days, 1);
    assert.equal(chart.visibleTotal, 150);
    assert.equal(chart.visibleCount, 4);
  });

  test('weekly aggregation starts on Monday and merges every day in the week', () => {
    assert.equal(startOfWeekKey('2026-06-14'), '2026-06-08');
    assert.equal(startOfWeekKey('2026-06-15'), '2026-06-15');
    assert.equal(startOfWeekKey('2026-06-21'), '2026-06-15');

    const chart = buildTrendSeries([
      group('2026-06-14', 10, 1),
      group('2026-06-15', 20, 1),
      group('2026-06-21', 30, 2),
      group('2026-06-22', 40, 1)
    ], 'weekly', 'all');

    assert.deepEqual(chart.series.map(item => item.key), ['2026-06-08', '2026-06-15', '2026-06-22']);
    assert.equal(chart.series[1].total, 50);
    assert.equal(chart.series[1].count, 3);
    assert.equal(chart.series[1].days, 2);
    assert.ok(chart.series[1].fullLabel.startsWith('Week of'));
  });

  test('monthly aggregation groups by calendar month and labels the month', () => {
    const chart = buildTrendSeries([
      group('2026-06-01', 10, 1),
      group('2026-06-30', 20, 2),
      group('2026-07-01', 40, 1)
    ], 'monthly', 'all');

    assert.deepEqual(chart.series.map(item => item.key), ['2026-06', '2026-07']);
    assert.equal(chart.series[0].total, 30);
    assert.equal(chart.series[0].count, 3);
    assert.equal(chart.series[0].shortLabel, 'Jun 2026');
  });

  test('display limits keep the latest periods while All keeps every period', () => {
    const groups = [
      group('2026-01-01', 10),
      group('2026-02-01', 20),
      group('2026-03-01', 30),
      group('2026-04-01', 40)
    ];
    const limited = buildTrendSeries(groups, 'monthly', 2);
    assert.deepEqual(limited.visible.map(item => item.key), ['2026-03', '2026-04']);
    assert.equal(limited.hiddenCount, 2);
    assert.equal(limited.visibleTotal, 70);

    const all = buildTrendSeries(groups, 'monthly', 'all');
    assert.equal(all.visible.length, 4);
    assert.equal(all.hiddenCount, 0);
    assert.equal(all.visibleTotal, 100);
  });

  test('empty datasets return safe zero totals without periods', () => {
    const chart = buildTrendSeries([], 'daily', 10);
    assert.equal(chart.series.length, 0);
    assert.equal(chart.visible.length, 0);
    assert.equal(chart.maxTotal, 0);
    assert.equal(chart.visibleTotal, 0);
    assert.equal(chart.averagePerPeriod, 0);
    assert.equal(chart.averagePerRecord, 0);
  });

  test('zero-value periods are kept and do not produce a misleading scale', () => {
    const chart = buildTrendSeries([
      group('2026-06-15', 0, 2),
      group('2026-06-16', 0, 1)
    ], 'daily', 'all');

    assert.equal(chart.visible.length, 2);
    assert.equal(chart.visibleTotal, 0);
    assert.equal(chart.maxTotal, 0);
    assert.equal(chart.averagePerPeriod, 0);
    assert.equal(chart.visible[0].count, 2);
    assert.deepEqual(buildNiceScale(chart.maxTotal).ticks, [0]);
  });

  test('undated and invalid groups are excluded from the dated trend', () => {
    const chart = buildTrendSeries([
      group('unknown', 50, 1),
      group('not-a-date', 60, 1),
      group('2026-06-15', 70, 1)
    ], 'daily', 'all');

    assert.equal(chart.series.length, 1);
    assert.equal(chart.series[0].key, '2026-06-15');
    assert.equal(chart.visibleTotal, 70);
  });

  test('large totals use a readable scale that starts at zero and covers the maximum', () => {
    const chart = buildTrendSeries([
      group('2026-06-15', 1234567, 3),
      group('2026-06-16', 800000, 1)
    ], 'daily', 'all');
    const scale = buildNiceScale(chart.maxTotal);

    assert.ok(scale.max >= chart.maxTotal);
    assert.equal(scale.ticks[0], 0);
    assert.equal(scale.ticks[scale.ticks.length - 1], scale.max);
    assert.ok(scale.ticks.length >= 3);
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(`\n${failure.name}\n${failure.err.stack}`);
    process.exit(1);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
