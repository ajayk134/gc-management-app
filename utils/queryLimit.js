const parseListLimit = (value, fallback = 50) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'all') {
    return { limit: 0, all: true };
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { limit: fallback, all: false };
  }
  return { limit: parsed, all: false };
};

const parseListPage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

module.exports = {
  parseListLimit,
  parseListPage
};
