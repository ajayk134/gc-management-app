const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
    unique: true
  },
  isCustom: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

providerSchema.index({ isCustom: 1, name: 1 });

module.exports = mongoose.model('Provider', providerSchema);