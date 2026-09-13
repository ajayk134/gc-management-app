const mongoose = require('mongoose');

const gcRecordSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  giftCard: {
    type: String,
    required: true,
    trim: true
  },
  giftCardPin: {
    type: String,
    required: true,
    trim: true
  },
  giftCardAmount: {
    type: Number,
    required: true,
    min: 0
  },
  provider: {
    type: String,
    trim: true,
    maxlength: 60,
    default: ''
  },
  adjustedAmount: {
    type: Number,
    min: 0
  },
  adjustedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adjustedAt: {
    type: Date
  },
  shared: {
    type: Boolean,
    default: false
  },
  sharedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sharedAt: {
    type: Date
  },
  paid: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid_back'],
    default: 'pending'
  },
  paidBackAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  adminNote: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  }
}, {
  timestamps: true
});

gcRecordSchema.index({ user: 1 });
gcRecordSchema.index({ paymentStatus: 1 });
gcRecordSchema.index({ createdAt: -1 });
gcRecordSchema.index({ user: 1, paymentStatus: 1 });
gcRecordSchema.index({ user: 1, createdAt: -1 });
gcRecordSchema.index({ user: 1, giftCard: 1, giftCardPin: 1 }, { unique: true });

module.exports = mongoose.model('GCRecord', gcRecordSchema);
