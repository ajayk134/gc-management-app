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

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Blocks creating new gift card records while maintenance mode is active.
// Reading records, signing in, and all other existing-data operations remain
// available to every user (including administrators).
const blockDuringDowntime = async (req, res, next) => {
  try {
    const activeDowntime = await findActiveDowntime();
    if (activeDowntime) {
      return res.status(503).json({
        error: 'New gift card records cannot be submitted while maintenance mode is active. Existing records remain available.',
        code: 'DOWNTIME_ACTIVE',
        downtime: serializeDowntime(activeDowntime)
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to check maintenance status' });
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

module.exports = { auth, adminOnly, userOnly, blockDuringDowntime };
