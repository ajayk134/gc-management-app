// Payment summary helpers.
//
// All grouping is date-based and uses the caller's time zone so that a
// payment recorded near midnight is shown on the same calendar day the user
// sees in the rest of the app. Payment-back amounts use the existing
// effective-paid rule (adjustedAmount overrides paid when an admin set one),
// matching /api/stats/user and every other dashboard total.

const { effectivePaid, hasAdjustment } = require('./effectivePaid');

const UNKNOWN_DATE_KEY = 'unknown';
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SORTS = new Set([
  'date-desc', 'date-asc', 'amount-desc', 'amount-asc'
]);

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const isValidTimeZone = (timeZone) => {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

const getDateKey = (value, timeZone = 'UTC') => {
  const date = toDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => parts.find(part => part.type === type)?.value;
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const isValidDateKey = (value) =>
  typeof value === 'string' && DATE_KEY_RE.test(value);

const serializePaymentRecord = (record) => {
  const adjusted = hasAdjustment(record);
  return {
    _id: record._id ? String(record._id) : undefined,
    giftCard: record.giftCard || '',
    provider: record.provider || '',
    giftCardAmount: toAmount(record.giftCardAmount),
    paid: toAmount(record.paid),
    adjustedAmount: adjusted ? toAmount(record.adjustedAmount) : null,
    effectivePaid: toAmount(effectivePaid(record)),
    paymentStatus: record.paymentStatus || 'pending',
    paidBackAt: record.paidBackAt || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    notes: record.notes || '',
    adminNote: record.adminNote || ''
  };
};

const summarizeRecords = (records = []) => {
  const summary = {
    totalRecords: 0,
    totalGiftCardAmount: 0,
    totalAmountPaid: 0,
    totalPaidBackAmount: 0,
    paidBackCount: 0,
    pendingAmount: 0,
    pendingCount: 0,
    missingPaidBackDateCount: 0
  };

  for (const record of records) {
    const amount = toAmount(effectivePaid(record));
    summary.totalRecords += 1;
    summary.totalGiftCardAmount += toAmount(record.giftCardAmount);
    summary.totalAmountPaid += amount;

    if (record.paymentStatus === 'paid_back') {
      summary.paidBackCount += 1;
      summary.totalPaidBackAmount += amount;
      if (!toDate(record.paidBackAt)) summary.missingPaidBackDateCount += 1;
    } else {
      summary.pendingCount += 1;
      summary.pendingAmount += amount;
    }
  }

  return summary;
};

const matchesSearch = (record, search) => {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return true;
  return [
    record.giftCard,
    record.provider,
    record.notes,
    record.adminNote
  ].some(value => String(value || '').toLowerCase().includes(term));
};

const inDateRange = (record, startDate, endDate, timeZone) => {
  if (!startDate && !endDate) return true;
  const key = getDateKey(record.paidBackAt, timeZone);
  if (!key) return false;
  if (startDate && key < startDate) return false;
  if (endDate && key > endDate) return false;
  return true;
};

const filterPaidBackRecords = (records, options = {}) => {
  const { startDate, endDate, search, timeZone = 'UTC' } = options;
  return records.filter(record => (
    record.paymentStatus === 'paid_back' &&
    matchesSearch(record, search) &&
    inDateRange(record, startDate, endDate, timeZone)
  ));
};

const sortGroups = (groups, sort = 'date-desc') => {
  const unknownLast = (a, b) => {
    if (a.key === UNKNOWN_DATE_KEY && b.key !== UNKNOWN_DATE_KEY) return 1;
    if (b.key === UNKNOWN_DATE_KEY && a.key !== UNKNOWN_DATE_KEY) return -1;
    return 0;
  };
  const compareDate = (a, b, direction) => {
    const unknown = unknownLast(a, b);
    if (unknown !== 0) return unknown;
    if (a.key === UNKNOWN_DATE_KEY && b.key === UNKNOWN_DATE_KEY) return 0;
    return direction * a.key.localeCompare(b.key);
  };

  return groups.sort((a, b) => {
    if (sort === 'date-asc') return compareDate(a, b, 1);
    if (sort === 'amount-desc') return b.totalPaid - a.totalPaid || compareDate(a, b, -1);
    if (sort === 'amount-asc') return a.totalPaid - b.totalPaid || compareDate(a, b, -1);
    return compareDate(a, b, -1);
  });
};

const groupPayments = (records, options = {}) => {
  const { timeZone = 'UTC', sort = 'date-desc' } = options;
  const buckets = new Map();

  for (const record of records) {
    const key = getDateKey(record.paidBackAt, timeZone) || UNKNOWN_DATE_KEY;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        date: key === UNKNOWN_DATE_KEY ? null : key,
        count: 0,
        totalPaid: 0,
        totalGiftCardAmount: 0,
        records: []
      });
    }
    const bucket = buckets.get(key);
    const recordDate = toDate(record.paidBackAt);
    bucket.count += 1;
    bucket.totalPaid += toAmount(effectivePaid(record));
    bucket.totalGiftCardAmount += toAmount(record.giftCardAmount);
    bucket.records.push({ ...serializePaymentRecord(record), _sortAt: recordDate ? recordDate.getTime() : 0 });
  }

  const groups = [...buckets.values()];
  for (const group of groups) {
    group.records.sort((a, b) => b._sortAt - a._sortAt);
    group.records.forEach(record => { delete record._sortAt; });
  }

  return sortGroups(groups, sort);
};

const buildFilteredTotals = (groups) => {
  const totals = {
    paidBackCount: 0,
    totalPaidBackAmount: 0,
    totalGiftCardAmount: 0,
    dayCount: groups.filter(group => group.key !== UNKNOWN_DATE_KEY).length,
    averagePaidBack: 0,
    missingPaidBackDateCount: 0
  };

  for (const group of groups) {
    totals.paidBackCount += group.count;
    totals.totalPaidBackAmount += group.totalPaid;
    totals.totalGiftCardAmount += group.totalGiftCardAmount;
    if (group.key === UNKNOWN_DATE_KEY) totals.missingPaidBackDateCount += group.count;
  }

  totals.averagePaidBack = totals.paidBackCount > 0
    ? totals.totalPaidBackAmount / totals.paidBackCount
    : 0;

  return totals;
};

const buildRecentActivity = (records = [], limit = 8) => {
  const events = [];

  for (const record of records) {
    const safe = serializePaymentRecord(record);
    if (record.paymentStatus === 'paid_back') {
      const paidBackAt = toDate(record.paidBackAt);
      const fallbackAt = toDate(record.updatedAt) || toDate(record.createdAt);
      events.push({
        type: 'paid_back',
        at: paidBackAt || fallbackAt,
        dateRecorded: Boolean(paidBackAt),
        record: safe
      });
    } else {
      const submittedAt = toDate(record.createdAt) || toDate(record.updatedAt);
      events.push({
        type: 'pending',
        at: submittedAt,
        dateRecorded: Boolean(submittedAt),
        record: safe
      });
    }
  }

  const sorted = events.sort((a, b) => {
    const aTime = a.at ? a.at.getTime() : 0;
    const bTime = b.at ? b.at.getTime() : 0;
    return bTime - aTime;
  });
  const visible = limit > 0 ? sorted.slice(0, limit) : sorted;

  return visible.map(event => ({
    ...event,
    at: event.at ? event.at.toISOString() : null
  }));
};

const buildPendingSummary = (records = [], search = '') => {
  const pending = records
    .filter(record => record.paymentStatus !== 'paid_back' && matchesSearch(record, search))
    .map(serializePaymentRecord)
    .sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return aTime - bTime;
    });

  return {
    count: pending.length,
    amount: pending.reduce((total, record) => total + record.effectivePaid, 0),
    records: pending
  };
};

const buildPaymentSummary = (records = [], options = {}) => {
  const {
    timeZone = 'UTC',
    startDate,
    endDate,
    search = '',
    sort = 'date-desc',
    recentActivityLimit = 8
  } = options;

  if (!isValidTimeZone(timeZone)) {
    const error = new Error('Invalid time zone');
    error.code = 'INVALID_TIME_ZONE';
    throw error;
  }
  if ((startDate && !isValidDateKey(startDate)) || (endDate && !isValidDateKey(endDate))) {
    const error = new Error('Dates must use YYYY-MM-DD format');
    error.code = 'INVALID_DATE';
    throw error;
  }

  const paidBackRecords = filterPaidBackRecords(records, {
    startDate,
    endDate,
    search,
    timeZone
  });
  const groups = groupPayments(paidBackRecords, { timeZone, sort });
  const allRecentActivity = buildRecentActivity(records, 0);
  const recentActivity = recentActivityLimit > 0
    ? allRecentActivity.slice(0, recentActivityLimit)
    : allRecentActivity;

  return {
    allTime: summarizeRecords(records),
    filtered: buildFilteredTotals(groups),
    groups,
    pending: buildPendingSummary(records, search),
    recentActivity,
    recentActivityTotal: allRecentActivity.length,
    timeZone,
    filters: {
      startDate: startDate || '',
      endDate: endDate || '',
      search,
      sort
    }
  };
};

module.exports = {
  UNKNOWN_DATE_KEY,
  SORTS,
  toDate,
  isValidTimeZone,
  isValidDateKey,
  getDateKey,
  serializePaymentRecord,
  summarizeRecords,
  filterPaidBackRecords,
  groupPayments,
  buildFilteredTotals,
  buildRecentActivity,
  buildPendingSummary,
  buildPaymentSummary
};
