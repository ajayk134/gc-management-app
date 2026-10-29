const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRANULARITIES = new Set(['daily', 'weekly', 'monthly']);

const toNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const parseDateKey = key => {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (key, days) => {
  const date = parseDateKey(key);
  if (!date) return key;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatDateKey = key => {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return key || '-';
  const [year, month, day] = key.split('-');
  return `${day} ${MONTHS[Number(month) - 1] || month} ${year}`;
};

const formatMonthKey = key => {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) return key || '-';
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1] || month} ${year}`;
};

export const startOfWeekKey = dateKey => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
};

const periodKey = (dateKey, granularity) => {
  if (granularity === 'weekly') return startOfWeekKey(dateKey);
  if (granularity === 'monthly') return dateKey.slice(0, 7);
  return dateKey;
};

const periodLabels = (key, granularity) => {
  if (granularity === 'weekly') {
    const endKey = addDays(key, 6);
    return {
      fullLabel: `Week of ${formatDateKey(key)} – ${formatDateKey(endKey)}`,
      shortLabel: `Wk ${formatDateKey(key)}`
    };
  }
  if (granularity === 'monthly') {
    const label = formatMonthKey(key);
    return { fullLabel: label, shortLabel: label };
  }
  const label = formatDateKey(key);
  return { fullLabel: label, shortLabel: label };
};

const sumItems = items => items.reduce((totals, item) => ({
  total: totals.total + item.total,
  count: totals.count + item.count
}), { total: 0, count: 0 });

export const buildTrendSeries = (groups = [], granularity = 'daily', limit = 10) => {
  const activeGranularity = GRANULARITIES.has(granularity) ? granularity : 'daily';
  const buckets = new Map();

  for (const group of groups) {
    if (!group || !DATE_KEY_RE.test(group.key || '')) continue;
    const key = periodKey(group.key, activeGranularity);
    if (!buckets.has(key)) {
      buckets.set(key, { key, count: 0, total: 0, days: new Set() });
    }
    const bucket = buckets.get(key);
    bucket.count += toNumber(group.count);
    bucket.total += toNumber(group.totalPaid);
    bucket.days.add(group.key);
  }

  const series = [...buckets.values()]
    .map(bucket => ({
      key: bucket.key,
      count: bucket.count,
      total: bucket.total,
      days: bucket.days.size,
      ...periodLabels(bucket.key, activeGranularity)
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const visible = limit === 'all'
    ? series
    : series.slice(-Math.max(1, Number(limit) || 1));
  const visibleTotals = sumItems(visible);
  const seriesTotals = sumItems(series);

  return {
    granularity: activeGranularity,
    series,
    visible,
    hiddenCount: Math.max(0, series.length - visible.length),
    maxTotal: visible.reduce((max, item) => Math.max(max, item.total), 0),
    visibleTotal: visibleTotals.total,
    visibleCount: visibleTotals.count,
    seriesTotal: seriesTotals.total,
    seriesCount: seriesTotals.count,
    averagePerPeriod: visible.length ? visibleTotals.total / visible.length : 0,
    averagePerRecord: visibleTotals.count ? visibleTotals.total / visibleTotals.count : 0
  };
};

export const buildNiceScale = (maxValue, tickCount = 4) => {
  const value = Number(maxValue);
  if (!Number.isFinite(value) || value <= 0) return { max: 0, step: 0, ticks: [0] };

  const roughStep = value / Math.max(1, tickCount);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  let niceResidual = 10;
  if (residual <= 1) {
    niceResidual = 1;
  } else if (residual <= 2) {
    niceResidual = 2;
  } else if (residual <= 2.5) {
    niceResidual = 2.5;
  } else if (residual <= 5) {
    niceResidual = 5;
  }

  const step = niceResidual * magnitude;
  const max = Math.ceil(value / step) * step;
  const ticks = [];
  for (let tick = 0; tick <= max + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }

  return { max, step, ticks };
};

export const TREND_GRANULARITIES = ['daily', 'weekly', 'monthly'];
