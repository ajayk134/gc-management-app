const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, startDate, endDate } = req.query;
    
    const filter = {};
    if (action) filter.action = action;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(filter)
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Delete single audit log (admin only) — deliberately NOT re-logged to
// avoid creating a confusing/infinite audit trail from audit maintenance.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid audit log ID' });
    }

    const log = await AuditLog.findByIdAndDelete(id);
    if (!log) {
      return res.status(404).json({ error: 'Audit log not found' });
    }

    res.json({ message: 'Audit log deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete audit log' });
  }
});

// Bulk delete audit logs (admin only). Deletes ONLY the explicitly
// provided IDs; invalid IDs are filtered out server-side. Also NOT
// re-logged to avoid noisy self-referential audit entries.
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Audit log IDs are required' });
    }

    const validIds = [...new Set(ids)].filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid audit log IDs provided' });
    }

    const result = await AuditLog.deleteMany({ _id: { $in: validIds } });

    res.json({
      message: `${result.deletedCount} audit log(s) deleted`,
      requestedCount: ids.length,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete audit logs' });
  }
});

module.exports = router;
