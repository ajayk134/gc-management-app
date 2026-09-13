const express = require('express');
const User = require('../models/User');
const GCRecord = require('../models/GCRecord');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { effectivePaidExpr } = require('../utils/effectivePaid');

const router = express.Router();

// All routes require auth + admin
router.use(auth, adminOnly);

// List users with stats
router.get('/', async (req, res) => {
  try {
    const { search, active } = req.query;
    const filter = { role: 'user' };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (active !== undefined) {
      filter.active = active === 'true';
    }

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });

    const usersWithStats = await Promise.all(users.map(async (user) => {
      const stats = await GCRecord.aggregate([
        { $match: { user: user._id } },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalAmount: { $sum: '$giftCardAmount' },
            totalPaid: { $sum: effectivePaidExpr },
            pendingAmount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, effectivePaidExpr, 0] }
            },
            paidBackAmount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, effectivePaidExpr, 0] }
            },
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
            },
            paidBackCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, 1, 0] }
            }
          }
        }
      ]);

      const s = stats[0] || { totalRecords: 0, totalAmount: 0, totalPaid: 0, pendingAmount: 0, paidBackAmount: 0, pendingCount: 0, paidBackCount: 0 };
      
      return {
        ...user.toJSON(),
        stats: s
      };
    }));

    res.json({ users: usersWithStats });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
router.post('/', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'user',
      active: true
    });

    await logAction('user_created', req.userId, 'user', user._id, { name: user.name, email: user.email }, req.ip);

    res.status(201).json({ user: user.toJSON() });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages[0] || 'Invalid user data' });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const { name, email, active } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot modify admin user' });
    }

    if (email && email !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      user.email = email.toLowerCase().trim();
    }

    const prevActive = user.active;
    if (name) user.name = name.trim();
    if (active !== undefined) user.active = active;

    await user.save();

    let action = 'user_edited';
    if (active !== undefined && prevActive !== user.active) {
      action = user.active ? 'user_enabled' : 'user_disabled';
    }
    await logAction(action, req.userId, 'user', user._id, { name: user.name, email: user.email, active: user.active }, req.ip);

    res.json({ user: user.toJSON() });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages[0] || 'Invalid user data' });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset password
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    await logAction('password_reset', req.userId, 'user', user._id, {}, req.ip);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin user' });
    }

    await GCRecord.deleteMany({ user: user._id });
    await User.findByIdAndDelete(user._id);

    await logAction('user_deleted', req.userId, 'user', user._id, { name: user.name, email: user.email }, req.ip);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
