const Downtime = require('../models/Downtime');

const OPEN_STATUSES = ['scheduled', 'active'];

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// The stored status is a helpful record of administrative actions, but the
// actual availability is always derived from the current time window. This
// makes activation and expiration automatic even if no background worker ran.
const effectiveStatus = (downtime, now = new Date()) => {
  const status = downtime.status || 'scheduled';
  if (status === 'cancelled' || status === 'completed') return status;

  const startAt = toDate(downtime.startAt);
  const endAt = toDate(downtime.endAt);
  const current = toDate(now);

  if (!startAt || !current) return status;
  if (endAt && endAt <= current) return 'completed';
  if (startAt <= current && (!endAt || endAt > current)) return 'active';
  return 'scheduled';
};

const serializeDowntime = (downtime, now = new Date()) => {
  if (!downtime) return null;
  const obj = downtime.toObject ? downtime.toObject() : { ...downtime };
  obj.status = effectiveStatus(downtime, now);
  return obj;
};

const activeFilter = (now = new Date()) => ({
  status: { $in: OPEN_STATUSES },
  startAt: { $lte: now },
  $or: [{ endAt: { $gt: now } }, { endAt: null }]
});

const upcomingFilter = (now = new Date()) => ({
  status: { $in: OPEN_STATUSES },
  startAt: { $gt: now }
});

const findActiveDowntime = (now = new Date()) => (
  Downtime.findOne(activeFilter(now)).sort({ startAt: 1 })
);

const findUpcomingDowntime = (now = new Date()) => (
  Downtime.findOne(upcomingFilter(now)).sort({ startAt: 1 })
);

const findOverlappingDowntime = ({ startAt, endAt, excludeId = null, now = new Date() }) => {
  const lowerBound = startAt > now ? startAt : now;
  const filter = {
    status: { $in: OPEN_STATUSES },
    startAt: { $lt: endAt },
    endAt: { $gt: lowerBound }
  };

  if (excludeId) filter._id = { $ne: excludeId };
  return Downtime.findOne(filter);
};

const downtimeWindowError = (startAt, endAt) => {
  if (!startAt || !endAt) return 'Start and end date/time are required';
  if (endAt <= startAt) return 'End date/time must be after the start date/time';
  if (endAt <= new Date()) return 'End date/time must be in the future';
  return null;
};

module.exports = {
  OPEN_STATUSES,
  effectiveStatus,
  serializeDowntime,
  activeFilter,
  upcomingFilter,
  findActiveDowntime,
  findUpcomingDowntime,
  findOverlappingDowntime,
  downtimeWindowError
};
