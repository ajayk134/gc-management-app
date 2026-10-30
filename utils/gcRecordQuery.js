const mongoose = require('mongoose');
const User = require('../models/User');

const SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'giftCard',
  'provider',
  'giftCardAmount',
  'paid',
  'adjustedAmount',
  'paymentStatus',
  'paidBackAt',
  'shared'
]);

const DATE_RANGE_FIELDS = [
  ['startDate', 'endDate'],
  ['paidBackStartDate', 'paidBackEndDate']
];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const parseAmount = (value) => {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseDate = (value, endOfDay = false) => {
  if (!hasValue(value)) return null;
  const text = String(value).trim();
  const parsed = endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59.999Z`)
    : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDateRange = (filter, field, startValue, endValue) => {
  const start = parseDate(startValue);
  const end = parseDate(endValue, true);
  if (!start && !end) return;
  filter[field] = {};
  if (start) filter[field].$gte = start;
  if (end) filter[field].$lte = end;
};

/**
 * Build the non-search part of a GC record filter. Kept synchronous so it can
 * be unit-tested without a database connection.
 */
function buildGCRecordFilterBase(query = {}, scope = {}) {
  const filter = {};

  if (scope.role === 'user') {
    filter.user = scope.userId;
  } else {
    const userIds = hasValue(query.userIds)
      ? String(query.userIds).split(',').map((id) => id.trim()).filter(Boolean)
      : [];

    if (userIds.length > 0) {
      const invalid = userIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
      if (invalid) {
        const error = new Error('Invalid userIds');
        error.status = 400;
        throw error;
      }
      filter.user = { $in: userIds };
    } else if (hasValue(query.userId)) {
      if (!mongoose.Types.ObjectId.isValid(query.userId)) {
        const error = new Error('Invalid userId');
        error.status = 400;
        throw error;
      }
      filter.user = query.userId;
    }
  }

  if (hasValue(query.status)) filter.paymentStatus = String(query.status);

  if (query.shared === 'shared') {
    filter.shared = true;
  } else if (query.shared === 'unshared') {
    filter.shared = { $ne: true };
  }

  addDateRange(filter, 'createdAt', query.startDate, query.endDate);
  addDateRange(filter, 'paidBackAt', query.paidBackStartDate, query.paidBackEndDate);

  const minAmount = parseAmount(query.minAmount);
  const maxAmount = parseAmount(query.maxAmount);
  if (minAmount !== null || maxAmount !== null) {
    filter.giftCardAmount = {};
    if (minAmount !== null) filter.giftCardAmount.$gte = minAmount;
    if (maxAmount !== null) filter.giftCardAmount.$lte = maxAmount;
  }

  const search = hasValue(query.search) ? String(query.search).trim() : '';
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { giftCard: regex },
      { provider: regex },
      { notes: regex },
      { adminNote: regex }
    ];
  }

  return filter;
}

async function buildGCRecordFilter(query = {}, scope = {}) {
  const filter = buildGCRecordFilterBase(query, scope);
  const search = hasValue(query.search) ? String(query.search).trim() : '';

  if (search && filter.$or) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const users = await User.find({
      $or: [{ name: regex }, { email: regex }]
    }).select('_id');
    if (users.length > 0) {
      filter.$or.push({ user: { $in: users.map((user) => user._id) } });
    }
  }

  return filter;
}

function parseGCRecordSort(query = {}) {
  const field = SORT_FIELDS.has(query.sort) ? query.sort : 'createdAt';
  const direction = String(query.order).toLowerCase() === 'asc' ? 1 : -1;
  const sort = { [field]: direction };
  if (field !== '_id') sort._id = direction;
  return sort;
}

module.exports = {
  SORT_FIELDS,
  buildGCRecordFilter,
  buildGCRecordFilterBase,
  parseGCRecordSort,
  escapeRegex
};
