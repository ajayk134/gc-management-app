const { reconcileDowntimeStatuses } = require('./downtime');

const DEFAULT_INTERVAL_MS = 30000;
let timer = null;
let running = false;

const tick = async (logger = console) => {
  if (running) return null;
  running = true;
  try {
    const result = await reconcileDowntimeStatuses();
    if (result.activated || result.completed) {
      logger.log(`Downtime scheduler: ${result.activated} activated, ${result.completed} completed`);
    }
    return result;
  } catch (error) {
    logger.error('Downtime scheduler error:', error.message);
    return null;
  } finally {
    running = false;
  }
};

const startDowntimeScheduler = ({ intervalMs = DEFAULT_INTERVAL_MS, logger = console } = {}) => {
  if (timer) return stopDowntimeScheduler;

  tick(logger);
  timer = setInterval(() => tick(logger), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return stopDowntimeScheduler;
};

const stopDowntimeScheduler = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

module.exports = {
  DEFAULT_INTERVAL_MS,
  startDowntimeScheduler,
  stopDowntimeScheduler,
  reconcileTick: tick
};
