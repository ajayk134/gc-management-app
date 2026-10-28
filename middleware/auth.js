const mongoose = require('mongoose');
const User = require('../models/User');
const { findActiveDowntime, serializeDowntime } = require('../utils/downtime');

const auth = async (req, res, next) => {
  try {
    let user = null;

    const userId = req.header('x-user-id');
    const userEmail = req.header('x-user-email');

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      user = await User.findById(userId).select('-password');
    } else if (userEmail) {
      user = await User.findOne({ email: userEmail.toLowerCase() }).select('-password');
    }

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Regular users are blocked while a scheduled downtime window is active.
    // Administrators are always allowed through so they can manage downtime.
    if (user.role !== 'admin') {
      const activeDowntime = await findActiveDowntime();
      if (activeDowntime) {
        return res.status(503).json({
          error: 'The application is temporarily unavailable due to scheduled maintenance.',
          code: 'DOWNTIME_ACTIVE',
          downtime: serializeDowntime(activeDowntime)
        });
      }
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const userOnly = (req, res, next) => {
  if (req.user.role !== 'user') {
    return res.status(403).json({ error: 'User access required' });
  }
  next();
};

module.exports = { auth, adminOnly, userOnly };
