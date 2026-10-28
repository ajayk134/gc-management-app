const mongoose = require('mongoose');

const downtimeSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
    maxlength: 120,
    default: 'Scheduled maintenance'
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  startAt: {
    type: Date,
    required: true
  },
  endAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'completed', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  startedAt: Date,
  stoppedAt: Date,
  cancelledAt: Date,
  stoppedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

downtimeSchema.index({ startAt: 1, endAt: 1 });
downtimeSchema.index({ status: 1, startAt: 1 });

module.exports = mongoose.model('Downtime', downtimeSchema);
