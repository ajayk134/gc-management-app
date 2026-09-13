const express = require('express');
const GCRecord = require('../models/GCRecord');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { effectivePaid } = require('../utils/effectivePaid');

const router = express.Router();

router.use(auth);

// Get GC records (admin sees all, user sees own)
router.get('/', async (req, res) => {
  try {
    const { search, status, startDate, endDate, sort, order, page = 1, limit = 50, userId } = req.query;
    
    const filter = {};
    
    if (req.user.role === 'user') {
      filter.user = req.userId;
    } else if (userId) {
      filter.user = userId;
    }

    if (status) {
      filter.paymentStatus = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    if (search) {
      const userIds = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      filter.$or = [
        { giftCard: { $regex: search, $options: 'i' } },
        { provider: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { adminNote: { $regex: search, $options: 'i' } }
      ];
      if (userIds.length > 0) {
        filter.$or.push({ user: { $in: userIds.map(u => u._id) } });
      }
    }

    const sortField = sort || 'createdAt';
    const sortOrder = order === 'asc' ? 1 : -1;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      GCRecord.find(filter)
        .populate('user', 'name email')
        .populate('adjustedBy', 'name email')
        .populate('sharedBy', 'name email')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit)),
      GCRecord.countDocuments(filter)
    ]);

    res.json({
      records,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// Get single record
router.get('/:id', async (req, res) => {
  try {
    const record = await GCRecord.findById(req.params.id).populate('user', 'name email').populate('adjustedBy', 'name email').populate('sharedBy', 'name email');
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (req.user.role === 'user' && record.user._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

// Create record (user or admin)
router.post('/', async (req, res) => {
  try {
    const { giftCard, giftCardPin, giftCardAmount, paid, notes, provider } = req.body;
    
    if (!giftCard || !giftCardPin || giftCardAmount === undefined || paid === undefined) {
      return res.status(400).json({ error: 'Gift Card, PIN, Amount, and Paid are required' });
    }

    if (giftCardAmount < 0 || paid < 0) {
      return res.status(400).json({ error: 'Amounts must be non-negative' });
    }

    const amountVal = parseFloat(giftCardAmount);
    const paidVal = parseFloat(paid);
    if (paidVal > amountVal) {
      return res.status(400).json({ error: 'Paid amount cannot exceed gift card amount' });
    }

    const userId = req.user.role === 'admin' ? (req.body.userId || req.userId) : req.userId;

    const trimmedCard = giftCard.trim();
    const trimmedPin = giftCardPin.trim();
    const trimmedProvider = String(provider || '').trim().slice(0, 60);

    const existing = await GCRecord.findOne({
      user: userId,
      giftCard: trimmedCard,
      giftCardPin: trimmedPin
    });

    if (existing) {
      return res.status(409).json({
        error: 'This Gift Card and PIN combination has already been submitted.',
        code: 'DUPLICATE_GC_PIN'
      });
    }

    const record = await GCRecord.create({
      user: userId,
      giftCard: trimmedCard,
      giftCardPin: trimmedPin,
      giftCardAmount: amountVal,
      provider: trimmedProvider,
      paid: paidVal,
      notes: notes || ''
    });

    await record.populate('user', 'name email');

    await logAction('record_created', req.userId, 'record', record._id, {
      giftCard: record.giftCard,
      provider: record.provider,
      amount: record.giftCardAmount,
      userId: userId
    }, req.ip);

    res.status(201).json({ record });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'This Gift Card and PIN combination has already been submitted.',
        code: 'DUPLICATE_GC_PIN'
      });
    }
    console.error('Create record error:', error);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// Update record
router.put('/:id', async (req, res) => {
  try {
    const record = await GCRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (req.user.role === 'user' && record.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { giftCard, giftCardPin, giftCardAmount, paid, notes, adminNote, provider, adjustedAmount } = req.body;

    const finalGiftCard = giftCard !== undefined ? giftCard.trim() : record.giftCard;
    const finalGiftCardPin = giftCardPin !== undefined ? giftCardPin.trim() : record.giftCardPin;

    const cardChanged = giftCard !== undefined || giftCardPin !== undefined;

    if (cardChanged) {
      const existing = await GCRecord.findOne({
        _id: { $ne: record._id },
        user: record.user,
        giftCard: finalGiftCard,
        giftCardPin: finalGiftCardPin
      });

      if (existing) {
        return res.status(409).json({
          error: 'This Gift Card and PIN combination has already been submitted.',
          code: 'DUPLICATE_GC_PIN'
        });
      }
    }

    if (giftCard !== undefined) record.giftCard = finalGiftCard;
    if (giftCardPin !== undefined) record.giftCardPin = finalGiftCardPin;

    // The original amount is preserved permanently: it is only ever set at
    // creation and is never overwritten via updates.
    const finalAmount = record.giftCardAmount;
    const finalPaid = paid !== undefined ? parseFloat(paid) : record.paid;
    if (paid !== undefined) {
      if (!Number.isFinite(finalPaid) || finalPaid < 0) {
        return res.status(400).json({ error: 'Paid amount must be a non-negative number' });
      }
      record.paid = finalPaid;
    }
    if (finalPaid > finalAmount) {
      return res.status(400).json({ error: 'Paid amount cannot exceed gift card amount' });
    }

    if (provider !== undefined) {
      const finalProvider = String(provider || '').trim().slice(0, 60);
      record.provider = finalProvider;
    }

    // Admin can set, change, or clear the adjusted/final amount for a record.
    // The original giftCardAmount is never touched. Records who adjusted it
    // and when for auditability.
    if (req.user.role === 'admin' && adjustedAmount !== undefined) {
      if (adjustedAmount === null || adjustedAmount === '') {
        record.adjustedAmount = undefined;
        record.adjustedBy = undefined;
        record.adjustedAt = undefined;
      } else {
        const adjustedVal = parseFloat(adjustedAmount);
        if (!Number.isFinite(adjustedVal) || adjustedVal < 0) {
          return res.status(400).json({ error: 'Adjusted amount must be a non-negative number' });
        }
        record.adjustedAmount = adjustedVal;
        record.adjustedBy = req.userId;
        record.adjustedAt = new Date();
      }
    }

    if (notes !== undefined) record.notes = notes;
    if (adminNote !== undefined && req.user.role === 'admin') record.adminNote = adminNote;

    await record.save();
    await record.populate('user', 'name email');

    const safeChanges = { ...req.body };
    delete safeChanges.giftCardPin;
    await logAction('record_edited', req.userId, 'record', record._id, { changes: safeChanges }, req.ip);

    res.json({ record });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'This Gift Card and PIN combination has already been submitted.',
        code: 'DUPLICATE_GC_PIN'
      });
    }
    console.error('Update record error:', error);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// Delete record
router.delete('/:id', async (req, res) => {
  try {
    const record = await GCRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (req.user.role === 'user' && record.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await GCRecord.findByIdAndDelete(record._id);

    await logAction('record_deleted', req.userId, 'record', record._id, {
      giftCard: record.giftCard,
      amount: record.giftCardAmount
    }, req.ip);

    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Mark as paid back (admin only)
router.post('/:id/pay', adminOnly, async (req, res) => {
  try {
    const { adminNote } = req.body;
    const record = await GCRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (record.paymentStatus === 'paid_back') {
      return res.status(400).json({ error: 'Record is already marked as paid back' });
    }

    record.paymentStatus = 'paid_back';
    record.paidBackAt = new Date();
    if (adminNote) record.adminNote = adminNote;

    await record.save();
    await record.populate('user', 'name email');

    await logAction('record_paid_back', req.userId, 'record', record._id, {
      giftCard: record.giftCard,
      amount: effectivePaid(record),
      userName: record.user.name
    }, req.ip);

    res.json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as paid back' });
  }
});

// Bulk pay back (admin only)
router.post('/bulk-pay', adminOnly, async (req, res) => {
  try {
    const { recordIds, adminNote } = req.body;
    
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'Record IDs are required' });
    }

    const results = { success: [], failed: [] };

    let skippedAlreadyPaid = 0;

    for (const id of recordIds) {
      try {
        const record = await GCRecord.findById(id);
        if (!record) {
          results.failed.push({ id, error: 'Not found' });
          continue;
        }

        if (record.paymentStatus === 'paid_back') {
          skippedAlreadyPaid++;
          continue;
        }

        record.paymentStatus = 'paid_back';
        record.paidBackAt = new Date();
        if (adminNote) record.adminNote = adminNote;
        await record.save();

        results.success.push(id);
      } catch (err) {
        results.failed.push({ id, error: err.message });
      }
    }

    if (skippedAlreadyPaid > 0) {
      results.skipped = skippedAlreadyPaid;
    }

    if (results.success.length > 0) {
      await logAction('bulk_paid_back', req.userId, 'record', results.success[0], {
        count: results.success.length,
        failedCount: results.failed.length,
        recordIds: results.success
      }, req.ip);
    }

    res.json({
      message: `${results.success.length} records marked as paid back`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: 'Bulk pay failed' });
  }
});

// Undo payment status (admin only)
router.post('/:id/undo-pay', adminOnly, async (req, res) => {
  try {
    const record = await GCRecord.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    record.paymentStatus = 'pending';
    record.paidBackAt = null;
    await record.save();
    await record.populate('user', 'name email');

    await logAction('record_edited', req.userId, 'record', record._id, {
      action: 'undo_paid_back',
      giftCard: record.giftCard
    }, req.ip);

    res.json({ record });
  } catch (error) {
    res.status(500).json({ error: 'Failed to undo payment status' });
  }
});

// Bulk undo payment status (admin only).
// Reverts paid_back -> pending and clears paidBackAt for eligible records.
// Pending/not-found records are skipped (never silently modified).
router.post('/bulk-undo-pay', adminOnly, async (req, res) => {
  try {
    const { recordIds } = req.body;

    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'Record IDs are required' });
    }

    const results = { success: [], skipped: [], failed: [] };

    for (const id of recordIds) {
      try {
        const record = await GCRecord.findById(id);
        if (!record) {
          results.skipped.push({ id, reason: 'Not found' });
          continue;
        }

        if (record.paymentStatus !== 'paid_back') {
          results.skipped.push({ id, reason: 'Not paid back' });
          continue;
        }

        record.paymentStatus = 'pending';
        record.paidBackAt = null;
        await record.save();

        results.success.push(id);
      } catch (err) {
        results.failed.push({ id, error: err.message });
      }
    }

    if (results.success.length > 0) {
      await logAction('record_edited', req.userId, 'record', results.success[0], {
        action: 'bulk_undo_paid_back',
        count: results.success.length,
        skippedCount: results.skipped.length,
        failedCount: results.failed.length,
        recordIds: results.success
      }, req.ip);
    }

    res.json({
      message: `${results.success.length} record(s) reverted to pending`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: 'Bulk undo failed' });
  }
});

// Toggle shared status for a single record (admin only)
router.post('/:id/share', adminOnly, async (req, res) => {
  try {
    const { shared } = req.body;
    const boolShared = shared === true;

    const record = await GCRecord.findById(req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (record.shared === boolShared) {
      return res.status(400).json({
        error: boolShared ? 'Record is already shared' : 'Record is already unshared'
      });
    }

    record.shared = boolShared;
    if (boolShared) {
      record.sharedBy = req.userId;
      record.sharedAt = new Date();
    } else {
      record.sharedBy = undefined;
      record.sharedAt = undefined;
    }

    await record.save();
    await record.populate('user', 'name email');

    await logAction(boolShared ? 'record_shared' : 'record_unshared', req.userId, 'record', record._id, {
      giftCard: record.giftCard,
      shared: boolShared
    }, req.ip);

    res.json({ record });
  } catch (error) {
    console.error('Share record error:', error);
    res.status(500).json({ error: 'Failed to update shared status' });
  }
});

// Bulk set shared status for selected records (admin only)
router.post('/bulk-share', adminOnly, async (req, res) => {
  try {
    const { recordIds, shared } = req.body;
    const boolShared = shared === true;

    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'Record IDs are required' });
    }

    const results = { success: [], skipped: [], failed: [] };

    for (const id of recordIds) {
      try {
        const record = await GCRecord.findById(id);
        if (!record) {
          results.skipped.push({ id, reason: 'Not found' });
          continue;
        }

        if (record.shared === boolShared) {
          results.skipped.push({ id, reason: 'Already in state' });
          continue;
        }

        record.shared = boolShared;
        if (boolShared) {
          record.sharedBy = req.userId;
          record.sharedAt = new Date();
        } else {
          record.sharedBy = undefined;
          record.sharedAt = undefined;
        }
        await record.save();

        results.success.push(id);
      } catch (err) {
        results.failed.push({ id, error: err.message });
      }
    }

    if (results.success.length > 0) {
      await logAction(boolShared ? 'bulk_shared' : 'bulk_unshared', req.userId, 'record', results.success[0], {
        count: results.success.length,
        skippedCount: results.skipped.length,
        failedCount: results.failed.length,
        recordIds: results.success
      }, req.ip);
    }

    res.json({
      message: `${results.success.length} record(s) marked as ${boolShared ? 'shared' : 'unshared'}`,
      results
    });
  } catch (error) {
    res.status(500).json({ error: 'Bulk share failed' });
  }
});

module.exports = router;
