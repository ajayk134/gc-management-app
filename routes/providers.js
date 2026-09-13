const express = require('express');
const Provider = require('../models/Provider');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();

router.use(auth);

// List providers with built-in defaults first, then custom ones
router.get('/', async (req, res) => {
  try {
    const providers = await Provider.find().sort({ isCustom: 1, name: 1 });
    res.json({ providers });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Add custom provider (admin only)
router.post('/', adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    const trimmed = String(name || '').trim();

    if (!trimmed) {
      return res.status(400).json({ error: 'Provider name is required' });
    }
    if (trimmed.length > 60) {
      return res.status(400).json({ error: 'Provider name must be 60 characters or fewer' });
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Provider.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });
    if (existing) {
      return res.status(409).json({ error: 'Provider already exists' });
    }

    const provider = await Provider.create({ name: trimmed, isCustom: true });

    await logAction('provider_added', req.userId, 'provider', provider._id, { name: provider.name }, req.ip);

    res.status(201).json({ provider });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Provider already exists' });
    }
    console.error('Add provider error:', error);
    res.status(500).json({ error: 'Failed to add provider' });
  }
});

// Delete custom provider (admin only)
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    if (!provider.isCustom) {
      return res.status(400).json({ error: 'Built-in providers cannot be deleted' });
    }

    await Provider.findByIdAndDelete(provider._id);

    await logAction('provider_removed', req.userId, 'provider', provider._id, { name: provider.name }, req.ip);

    res.json({ message: 'Provider removed' });
  } catch (error) {
    console.error('Delete provider error:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

module.exports = router;