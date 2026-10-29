export const LIST_LIMIT_OPTIONS = [5, 10, 20, 50, 'all'];
export const DEFAULT_LIST_LIMIT = 10;

export const normalizeListLimit = (value, fallback = DEFAULT_LIST_LIMIT) => {
  if (value === 'all' || value === 'All') return 'all';
  const parsed = Number(value);
  return LIST_LIMIT_OPTIONS.includes(parsed) ? parsed : fallback;
};

export const limitItems = (items, limit) => {
  if (!Array.isArray(items)) return [];
  if (limit === 'all') return items;
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed < 1) return [];
  return items.slice(0, parsed);
};

export const limitLabel = (limit) => (limit === 'all' ? 'All' : String(limit));
