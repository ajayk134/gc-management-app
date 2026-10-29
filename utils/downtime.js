const Downtime = require('../models/Downtime');

const OPEN_STATUSES = ['scheduled', 'active'];

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

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

const findOverlappingDowntime = ({ startAt, endAt, excludeId = null }) => {
  if (!startAt || !endAt) return Promise.resolve(null);

  const filter = {
    status: { $in: OPEN_STATUSES },
    startAt: { $lt: endAt },
    $or: [{ endAt: null }, { endAt: { $gt: startAt } }]
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

const reconcileDowntimeStatuses = async (now = new Date()) => {
  const current = toDate(now) || new Date();
  let activated = 0;
  let completed = 0;

  const toActivate = await Downtime.find({
    status: 'scheduled',
    startAt: { $lte: current },
    $or: [{ endAt: null }, { endAt: { $gt: current } }]
  });

  for (const downtime of toActivate) {
    downtime.status = 'active';
    if (!downtime.startedAt) {
      downtime.startedAt = toDate(downtime.startAt) || current;
    }
    await downtime.save();
    activated++;
  }

  const toComplete = await Downtime.find({
    status: { $in: OPEN_STATUSES },
    endAt: { $ne: null, $lte: current }
  });

  for (const downtime of toComplete) {
    downtime.status = 'completed';
    if (!downtime.stoppedAt) {
      downtime.stoppedAt = toDate(downtime.endAt) || current;
    }
    await downtime.save();
    completed++;
  }

  return { activated, completed, now: current };
};

const downtimeCountdown = (downtime, now = new Date()) => {
  if (!downtime) return null;
  const current = toDate(now) || new Date();
  const status = effectiveStatus(downtime, current);
  const startAt = toDate(downtime.startAt);
  const endAt = toDate(downtime.endAt);
  const target = status === 'active' ? endAt : (status === 'scheduled' ? startAt : null);
  if (!target) return null;
  return {
    status,
    targetAt: target,
    remainingMs: Math.max(0, target.getTime() - current.getTime())
  };
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
  downtimeWindowError,
  reconcileDowntimeStatuses,
  downtimeCountdown
};
