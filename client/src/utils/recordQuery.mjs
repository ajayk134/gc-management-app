export const DEFAULT_FILTERS = Object.freeze({
  userId: '',
  shared: '',
  startDate: '',
  endDate: '',
  paidBackStartDate: '',
  paidBackEndDate: '',
  minAmount: '',
  maxAmount: ''
});

export const FILTER_KEYS = Object.keys(DEFAULT_FILTERS);
export const DEFAULT_SORT = Object.freeze({ field: 'createdAt', order: 'desc' });
export const RECENT_DAYS = 30;

export const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest submitted first' },
  { value: 'createdAt:asc', label: 'Oldest submitted first' },
  { value: 'giftCardAmount:desc', label: 'GC amount: high to low' },
  { value: 'giftCardAmount:asc', label: 'GC amount: low to high' },
  { value: 'paid:desc', label: 'Paid amount: high to low' },
  { value: 'paid:asc', label: 'Paid amount: low to high' },
  { value: 'paidBackAt:desc', label: 'Paid back: newest first' },
  { value: 'paidBackAt:asc', label: 'Paid back: oldest first' },
  { value: 'giftCard:asc', label: 'Gift card: A to Z' },
  { value: 'giftCard:desc', label: 'Gift card: Z to A' },
  { value: 'provider:asc', label: 'Provider: A to Z' },
  { value: 'paymentStatus:asc', label: 'Status: pending first' }
];

export const PRESETS = [
  { key: 'all', label: 'All Records' },
  { key: 'pending', label: 'Pending Payments' },
  { key: 'paid_back', label: 'Paid Back' },
  { key: 'recent', label: 'Recently Submitted' }
];

export const COLUMN_OPTIONS = [
  { key: 'user', label: 'User' },
  { key: 'pin', label: 'Gift Card PIN' },
  { key: 'provider', label: 'Provider' },
  { key: 'amount', label: 'GC amount' },
  { key: 'paid', label: 'Paid amount' },
  { key: 'status', label: 'Status' },
  { key: 'shared', label: 'Shared' },
  { key: 'submitted', label: 'Submitted date' },
  { key: 'paidBack', label: 'Paid back date' },
  { key: 'notes', label: 'Notes' }
];

export const DEFAULT_COLUMNS = Object.freeze({
  user: true,
  pin: true,
  provider: true,
  amount: true,
  paid: true,
  status: true,
  shared: true,
  submitted: true,
  paidBack: true,
  notes: false
});

const nonEmpty = (value) => value !== undefined && value !== null && String(value).trim() !== '';

export function toDateInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function recentStartDate(now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - RECENT_DAYS);
  return toDateInputValue(start);
}

export function buildRecordQuery({
  search = '',
  status = '',
  filters = DEFAULT_FILTERS,
  sort = DEFAULT_SORT,
  page = 1,
  pageSize = 10,
  includePaging = true
} = {}) {
  const params = new URLSearchParams();

  if (nonEmpty(search)) params.set('search', String(search).trim());
  if (nonEmpty(status)) params.set('status', String(status));
  for (const key of FILTER_KEYS) {
    if (nonEmpty(filters[key])) params.set(key, String(filters[key]).trim());
  }

  if (sort && sort.field) {
    params.set('sort', sort.field);
    params.set('order', sort.order === 'asc' ? 'asc' : 'desc');
  }

  if (includePaging) {
    params.set('page', String(page));
    params.set('limit', pageSize === 'all' ? 'all' : String(pageSize));
  }

  return params;
}

export function countActiveFilters({ search = '', status = '', filters = DEFAULT_FILTERS } = {}) {
  let count = 0;
  if (nonEmpty(search)) count += 1;
  if (nonEmpty(status)) count += 1;
  for (const key of FILTER_KEYS) {
    if (nonEmpty(filters[key])) count += 1;
  }
  return count;
}

export function hasActiveFilters(state = {}) {
  return countActiveFilters(state) > 0;
}

const formatAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(parsed);
};

const formatRange = (from, to, formatValue = (value) => value) => {
  if (from && to) return `${formatValue(from)} – ${formatValue(to)}`;
  if (from) return `From ${formatValue(from)}`;
  return `Up to ${formatValue(to)}`;
};

export function buildFilterChips({ search = '', status = '', filters = DEFAULT_FILTERS, users = [] } = {}) {
  const chips = [];

  if (nonEmpty(search)) chips.push({ key: 'search', label: `Search: ${String(search).trim()}` });

  if (nonEmpty(status)) {
    chips.push({
      key: 'status',
      label: `Status: ${status === 'paid_back' ? 'Paid Back' : 'Pending'}`
    });
  }

  if (nonEmpty(filters.userId)) {
    const user = users.find((item) => String(item._id || item.id) === String(filters.userId));
    chips.push({ key: 'userId', label: `User: ${user ? user.name : 'Selected user'}` });
  }

  if (filters.shared === 'shared') chips.push({ key: 'shared', label: 'Sharing: Shared' });
  if (filters.shared === 'unshared') chips.push({ key: 'shared', label: 'Sharing: Unshared' });

  if (nonEmpty(filters.startDate) || nonEmpty(filters.endDate)) {
    chips.push({
      key: 'submitted',
      label: `Submitted: ${formatRange(filters.startDate, filters.endDate)}`
    });
  }

  if (nonEmpty(filters.paidBackStartDate) || nonEmpty(filters.paidBackEndDate)) {
    chips.push({
      key: 'paidBack',
      label: `Paid back: ${formatRange(filters.paidBackStartDate, filters.paidBackEndDate)}`
    });
  }

  if (nonEmpty(filters.minAmount) || nonEmpty(filters.maxAmount)) {
    chips.push({
      key: 'amount',
      label: `GC amount: ${formatRange(filters.minAmount, filters.maxAmount, formatAmount)}`
    });
  }

  return chips;
}

export function presetToState(key, now = new Date()) {
  const filters = { ...DEFAULT_FILTERS };
  let status = '';
  let search = '';

  if (key === 'pending') status = 'pending';
  if (key === 'paid_back') status = 'paid_back';
  if (key === 'recent') filters.startDate = recentStartDate(now);

  return {
    search,
    status,
    filters,
    sort: { ...DEFAULT_SORT }
  };
}

export function detectPreset({ search = '', status = '', filters = DEFAULT_FILTERS }, now = new Date()) {
  if (nonEmpty(search)) return null;

  const filled = FILTER_KEYS.filter((key) => nonEmpty(filters[key]));
  if (status === 'pending' && filled.length === 0) return 'pending';
  if (status === 'paid_back' && filled.length === 0) return 'paid_back';

  if (status) return null;

  if (filled.length === 0) return 'all';

  const recent = recentStartDate(now);
  if (
    filled.length === 1 &&
    filled[0] === 'startDate' &&
    filters.startDate === recent
  ) {
    return 'recent';
  }

  return null;
}

export function sortStateToValue(sort = DEFAULT_SORT) {
  return `${sort.field || 'createdAt'}:${sort.order === 'asc' ? 'asc' : 'desc'}`;
}

export function sortValueToState(value) {
  const [field = 'createdAt', order = 'desc'] = String(value || '').split(':');
  return {
    field: field || 'createdAt',
    order: order === 'asc' ? 'asc' : 'desc'
  };
}

export function getSortLabel(sort = DEFAULT_SORT) {
  const value = sortStateToValue(sort);
  return SORT_OPTIONS.find((option) => option.value === value)?.label || 'Newest submitted first';
}

export function parseColumnPrefs(raw) {
  if (!raw) return { ...DEFAULT_COLUMNS };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_COLUMNS };
    }
    const merged = { ...DEFAULT_COLUMNS };
    for (const option of COLUMN_OPTIONS) {
      if (typeof parsed[option.key] === 'boolean') merged[option.key] = parsed[option.key];
    }
    return merged;
  } catch {
    return { ...DEFAULT_COLUMNS };
  }
}

export function visibleColumns(prefs = DEFAULT_COLUMNS) {
  const normalized = parseColumnPrefs(prefs);
  return COLUMN_OPTIONS.reduce((columns, option) => {
    columns[option.key] = normalized[option.key] !== false;
    return columns;
  }, {});
}

export function visibleColumnKeys(prefs = DEFAULT_COLUMNS) {
  const visible = visibleColumns(prefs);
  return COLUMN_OPTIONS.filter((option) => visible[option.key]).map((option) => option.key);
}

export function getResultCounts(results = {}) {
  results = results || {};
  const countValue = (value) => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return 0;
  };
  return {
    success: countValue(results.success),
    skipped: countValue(results.skipped),
    failed: countValue(results.failed)
  };
}

export function getPageItems(current, pages, windowSize = 5) {
  const total = Math.max(0, Number(pages) || 0);
  const active = Math.min(Math.max(1, Number(current) || 1), Math.max(1, total));
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= windowSize + 2) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items = new Set([1, total]);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, active - half);
  let end = Math.min(total - 1, start + windowSize - 1);
  start = Math.max(2, end - windowSize + 1);

  for (let page = start; page <= end; page += 1) items.add(page);

  const sorted = [...items].sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) {
      withGaps.push(`gap-${sorted[index - 1]}`);
    }
    withGaps.push(page);
  });
  return withGaps;
}
