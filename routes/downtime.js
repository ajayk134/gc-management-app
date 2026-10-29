const express = require('express');
const mongoose = require('mongoose');
const Downtime = require('../models/Downtime');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const {
  effectiveStatus,
  serializeDowntime,
  activeFilter,
  findActiveDowntime,
  findUpcomingDowntime,
  findOverlappingDowntime,
  downtimeWindowError
} = require('../utils/downtime');

const router = express.Router();

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const parseWindow = (body) => {
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: 'Valid start and end date/time are required' };
  }
  const windowError = downtimeWindowError(startAt, endAt);
  if (windowError) return { error: windowError };
  return { startAt, endAt };
};

const overlapResponse = (res) => (
  res.status(409).json({ error: 'This window overlaps an existing scheduled or active downtime' })
);

router.get('/status', async (req, res) => {
  try {
    const now = new Date();
    const [active, upcoming] = await Promise.all([
      findActiveDowntime(now),
      findUpcomingDowntime(now)
    ]);

    res.json({
      serverTime: now.toISOString(),
      active: Boolean(active),
      enabled: Boolean(active),
      message: active?.message || '',
      downtime: serializeDowntime(active, now),
      upcoming: serializeDowntime(upcoming, now)
    });
  } catch (error) {
    console.error('Downtime status error:', error);
    res.status(500).json({ error: 'Failed to fetch downtime status' });
  }
});

router.use(auth, adminOnly);

const setMaintenanceState = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false' });
    }

    const now = new Date();
    const title = cleanText(req.body.title, 120) || 'Maintenance in progress';
    const message = cleanText(req.body.message, 500)
      || 'New gift card submissions are temporarily paused while maintenance is completed. Existing records remain available.';

    let current = await findActiveDowntime(now);

    if (enabled) {
      if (current) {
        if (req.body.title !== undefined) current.title = title;
        if (req.body.message !== undefined) current.message = message;
        await current.save();
      } else {
        const upcoming = await findUpcomingDowntime(now);
        if (upcoming) {
          return res.status(409).json({
            error: 'A maintenance window is already scheduled. Start, reschedule, or cancel it before enabling maintenance now.'
          });
        }

        current = await Downtime.create({
          title,
          message,
          startAt: now,
          endAt: null,
          status: 'active',
          startedAt: now,
          createdBy: req.userId
        });

        await logAction('downtime_started', req.userId, 'downtime', current._id, {
          title: current.title,
          startAt: current.startAt,
          mode: 'maintenance'
        }, req.ip);
      }
      await current.populate('createdBy', 'name email');
    } else {
      const activeEntries = await Downtime.find(activeFilter(now));
      for (const entry of activeEntries) {
        entry.endAt = now;
        entry.status = 'completed';
        entry.stoppedAt = now;
        entry.stoppedBy = req.userId;
        await entry.save();

        await logAction('downtime_stopped', req.userId, 'downtime', entry._id, {
          title: entry.title,
          startAt: entry.startAt,
          endAt: entry.endAt,
          mode: 'maintenance'
        }, req.ip);
      }
      current = null;
    }

    res.json({
      serverTime: now.toISOString(),
      active: Boolean(current),
      enabled: Boolean(current),
      current: serializeDowntime(current, now),
      downtime: serializeDowntime(current, now),
      message: current?.message || ''
    });
  } catch (error) {
    console.error('Set maintenance state error:', error);
    res.status(500).json({ error: 'Failed to update maintenance mode' });
  }
};

router.put('/', setMaintenanceState);
router.post('/toggle', setMaintenanceState);

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const [downtimes, active, upcoming] = await Promise.all([
      Downtime.find().populate('createdBy', 'name email').sort({ startAt: -1 }).limit(200),
      findActiveDowntime(now),
      findUpcomingDowntime(now)
    ]);

    res.json({
      serverTime: now.toISOString(),
      active: Boolean(active),
      enabled: Boolean(active),
      message: active?.message || '',
      current: serializeDowntime(active, now),
      upcoming: serializeDowntime(upcoming, now),
      downtimes: downtimes.map(item => serializeDowntime(item, now))
    });
  } catch (error) {
    console.error('Get downtimes error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled downtime' });
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = parseWindow(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { startAt, endAt } = parsed;
    const title = cleanText(req.body.title, 120) || 'Scheduled maintenance';
    const message = cleanText(req.body.message, 500);

    const overlap = await findOverlappingDowntime({ startAt, endAt });
    if (overlap) return overlapResponse(res);

    const now = new Date();
    const isImmediate = startAt <= now;
    const downtime = await Downtime.create({
      title,
      message,
      startAt,
      endAt,
      status: isImmediate ? 'active' : 'scheduled',
      startedAt: isImmediate ? now : undefined,
      createdBy: req.userId
    });

    await downtime.populate('createdBy', 'name email');

    await logAction(isImmediate ? 'downtime_started' : 'downtime_scheduled', req.userId, 'downtime', downtime._id, {
      title: downtime.title,
      startAt: downtime.startAt,
      endAt: downtime.endAt
    }, req.ip);

    res.status(201).json({ downtime: serializeDowntime(downtime, now) });
  } catch (error) {
    console.error('Create downtime error:', error);
    res.status(500).json({ error: 'Failed to schedule downtime' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid downtime ID' });
    }

    const downtime = await Downtime.findById(req.params.id);
    if (!downtime) return res.status(404).json({ error: 'Downtime not found' });

    const now = new Date();
    if (effectiveStatus(downtime, now) !== 'scheduled') {
      return res.status(400).json({ error: 'Only future scheduled downtime can be edited or rescheduled' });
    }

    const parsed = parseWindow(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { startAt, endAt } = parsed;
    const overlap = await findOverlappingDowntime({
      startAt,
      endAt,
      excludeId: downtime._id
    });
    if (overlap) return overlapResponse(res);

    const title = req.body.title !== undefined
      ? (cleanText(req.body.title, 120) || 'Scheduled maintenance')
      : downtime.title;
    const message = req.body.message !== undefined
      ? cleanText(req.body.message, 500)
      : downtime.message;

    const isImmediate = startAt <= now;
    downtime.title = title;
    downtime.message = message;
    downtime.startAt = startAt;
    downtime.endAt = endAt;
    downtime.status = isImmediate ? 'active' : 'scheduled';
    downtime.startedAt = isImmediate ? now : undefined;
    await downtime.save();
    await downtime.populate('createdBy', 'name email');

    await logAction(isImmediate ? 'downtime_started' : 'downtime_rescheduled', req.userId, 'downtime', downtime._id, {
      title: downtime.title,
      startAt: downtime.startAt,
      endAt: downtime.endAt
    }, req.ip);

    res.json({ downtime: serializeDowntime(downtime, now) });
  } catch (error) {
    console.error('Reschedule downtime error:', error);
    res.status(500).json({ error: 'Failed to reschedule downtime' });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid downtime ID' });
    }

    const downtime = await Downtime.findById(req.params.id);
    if (!downtime) return res.status(404).json({ error: 'Downtime not found' });

    const now = new Date();
    const status = effectiveStatus(downtime, now);
    if (status !== 'scheduled') {
      return res.status(400).json({ error: 'Only future scheduled downtime can be started' });
    }
    if (downtime.endAt <= now) {
      return res.status(400).json({ error: 'The scheduled end time has already passed' });
    }

    const overlap = await findOverlappingDowntime({
      startAt: now,
      endAt: downtime.endAt,
      excludeId: downtime._id
    });
    if (overlap) {
      return res.status(409).json({ error: 'Another downtime is already active or overlaps this window' });
    }

    downtime.startAt = now;
    downtime.status = 'active';
    downtime.startedAt = now;
    await downtime.save();
    await downtime.populate('createdBy', 'name email');

    await logAction('downtime_started', req.userId, 'downtime', downtime._id, {
      title: downtime.title,
      startAt: downtime.startAt,
      endAt: downtime.endAt
    }, req.ip);

    res.json({ downtime: serializeDowntime(downtime, now) });
  } catch (error) {
    console.error('Start downtime error:', error);
    res.status(500).json({ error: 'Failed to start downtime' });
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid downtime ID' });
    }

    const downtime = await Downtime.findById(req.params.id);
    if (!downtime) return res.status(404).json({ error: 'Downtime not found' });

    const now = new Date();
    if (effectiveStatus(downtime, now) !== 'active') {
      return res.status(400).json({ error: 'Only active downtime can be stopped' });
    }

    downtime.endAt = now;
    downtime.status = 'completed';
    downtime.stoppedAt = now;
    downtime.stoppedBy = req.userId;
    await downtime.save();
    await downtime.populate('createdBy', 'name email');

    await logAction('downtime_stopped', req.userId, 'downtime', downtime._id, {
      title: downtime.title,
      startAt: downtime.startAt,
      endAt: downtime.endAt
    }, req.ip);

    res.json({ downtime: serializeDowntime(downtime, now) });
  } catch (error) {
    console.error('Stop downtime error:', error);
    res.status(500).json({ error: 'Failed to stop downtime' });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid downtime ID' });
    }

    const downtime = await Downtime.findById(req.params.id);
    if (!downtime) return res.status(404).json({ error: 'Downtime not found' });

    const now = new Date();
    if (effectiveStatus(downtime, now) !== 'scheduled') {
      return res.status(400).json({ error: 'Only future scheduled downtime can be cancelled' });
    }

    downtime.status = 'cancelled';
    downtime.cancelledAt = now;
    downtime.cancelledBy = req.userId;
    await downtime.save();
    await downtime.populate('createdBy', 'name email');

    await logAction('downtime_cancelled', req.userId, 'downtime', downtime._id, {
      title: downtime.title,
      startAt: downtime.startAt,
      endAt: downtime.endAt
    }, req.ip);

    res.json({ downtime: serializeDowntime(downtime, now) });
  } catch (error) {
    console.error('Cancel downtime error:', error);
    res.status(500).json({ error: 'Failed to cancel downtime' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid downtime ID' });
    }

    const downtime = await Downtime.findById(req.params.id);
    if (!downtime) return res.status(404).json({ error: 'Downtime not found' });

    const status = effectiveStatus(downtime, new Date());
    if (!['completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Active or scheduled downtime must be stopped or cancelled before deletion' });
    }

    await Downtime.findByIdAndDelete(downtime._id);

    await logAction('downtime_deleted', req.userId, 'downtime', downtime._id, {
      title: downtime.title,
      startAt: downtime.startAt,
      endAt: downtime.endAt,
      status
    }, req.ip);

    res.json({ message: 'Downtime entry deleted' });
  } catch (error) {
    console.error('Delete downtime error:', error);
    res.status(500).json({ error: 'Failed to delete downtime' });
  }
});

module.exports = router;
