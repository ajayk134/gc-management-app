const express = require('express');
const GCRecord = require('../models/GCRecord');
const User = require('../models/User');
const { auth, adminOnly, userOnly } = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// User stats (for user portal)
router.get('/user', userOnly, async (req, res) => {
  try {
    const stats = await GCRecord.aggregate([
      { $match: { user: req.userId } },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalAmount: { $sum: '$giftCardAmount' },
          totalPaid: { $sum: '$paid' },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$paid', 0] }
          },
          paidBackAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, '$paid', 0] }
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
    res.json(s);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Admin stats
router.get('/admin', adminOnly, async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const matchFilter = {};
    if (userId) matchFilter.user = userId;
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
      if (endDate) matchFilter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [totalUsers, activeUsers, overallStats, perUserStats] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', active: true }),
      GCRecord.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalAmount: { $sum: '$giftCardAmount' },
            totalPaid: { $sum: '$paid' },
            pendingAmount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$paid', 0] }
            },
            paidBackAmount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, '$paid', 0] }
            },
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
            },
            paidBackCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, 1, 0] }
            }
          }
        }
      ]),
      GCRecord.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: '$user',
            totalRecords: { $sum: 1 },
            totalAmount: { $sum: '$giftCardAmount' },
            totalPaid: { $sum: '$paid' },
            pendingAmount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$paid', 0] }
            },
            paidBackAmount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, '$paid', 0] }
            },
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
            },
            paidBackCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid_back'] }, 1, 0] }
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        { $unwind: '$userInfo' },
        { $sort: { totalAmount: -1 } }
      ])
    ]);

    const overall = overallStats[0] || { totalRecords: 0, totalAmount: 0, totalPaid: 0, pendingAmount: 0, paidBackAmount: 0, pendingCount: 0, paidBackCount: 0 };

    res.json({
      totalUsers,
      activeUsers,
      ...overall,
      perUser: perUserStats.map(u => ({
        userId: u._id,
        name: u.userInfo.name,
        email: u.userInfo.email,
        active: u.userInfo.active,
        totalRecords: u.totalRecords,
        totalAmount: u.totalAmount,
        totalPaid: u.totalPaid,
        pendingAmount: u.pendingAmount,
        paidBackAmount: u.paidBackAmount,
        pendingCount: u.pendingCount,
        paidBackCount: u.paidBackCount
      }))
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

module.exports = router;
