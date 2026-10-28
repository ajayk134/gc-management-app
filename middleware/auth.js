const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    let user = null;

    // Try to get user from custom headers (for session-based auth without tokens)
    const userId = req.header('x-user-id') || req.header('X-User-Id') || req.body?.userId || req.query?.userId;
    const userEmail = req.header('x-user-email') || req.header('X-User-Email') || req.body?.email || req.query?.email;

    if (userId) {
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
