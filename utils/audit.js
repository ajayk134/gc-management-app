const AuditLog = require('../models/AuditLog');

const logAction = async (action, performedBy, targetType, targetId, metadata = {}, ipAddress = null) => {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetType,
      targetId,
      metadata,
      ipAddress
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { logAction };
