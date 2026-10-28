const express = require('express');
const mongoose = require('mongoose');
const Downtime = require('../models/Downtime');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const {
  effectiveStatus,
  serializeDowntime,
  findActiveDowntime,
  findUpcomingDowntime,
  findOverlappingDowntime,
  downtimeWindowError
} = require('../utils/downtime');

const router = express.Router();

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

// Public status endpoint. Intentionally exposes only the minimum information
// needed to render the maintenance notice and upcoming-downtime ribbon.
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
      downtime: serializeDowntime(active, now),
      upcoming: serializeDowntime(upcoming, now)
    });
  } catch (error) {
    console.error('Downtime status error:', error);
    res.status(500).json({ error: 'Failed to fetch downtime status' });
  }
});

// All routes below are restricted to administrators. Administrators are also
// exempt from the application-wide downtime guard so they can always manage it.
router.use(auth, adminOnly);

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
    const startAt = new Date(req.body.startAt);
    const endAt = new Date(req.body.endAt);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({ error: 'Valid start and end date/time are required' });
    }

    const windowError = downtimeWindowError(startAt, endAt);
    if (windowError) return res.status(400).json({ error: windowError });

    const title = cleanText(req.body.title, 120) || 'Scheduled maintenance';
    const message = cleanText(req.body.message, 500);

    const overlap = await findOverlappingDowntime({ startAt, endAt, now: new Date() });
    if (overlap) {
      return res.status(409).json({ error: 'This window overlaps an existing scheduled or active downtime' });
    }

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
      excludeId: downtime._id,
      now
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
