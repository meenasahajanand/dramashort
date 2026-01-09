const mongoose = require('mongoose');

const blockedIPSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  blockedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    default: 'Too many failed login attempts'
  },
  attempts: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster lookups
blockedIPSchema.index({ ip: 1 });
blockedIPSchema.index({ blockedAt: 1 });

module.exports = mongoose.model('BlockedIP', blockedIPSchema);

