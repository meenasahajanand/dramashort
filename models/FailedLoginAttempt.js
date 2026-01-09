const mongoose = require('mongoose');

const failedLoginAttemptSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  attempts: {
    type: Number,
    default: 1
  },
  lastAttempt: {
    type: Date,
    default: Date.now
  },
  firstAttempt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster lookups
failedLoginAttemptSchema.index({ ip: 1 });
failedLoginAttemptSchema.index({ lastAttempt: 1 });

// TTL index - auto delete after 24 hours
failedLoginAttemptSchema.index({ lastAttempt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('FailedLoginAttempt', failedLoginAttemptSchema);

