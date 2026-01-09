const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    trim: true,
    minlength: [3, 'Username must be at least 3 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: function() {
      // Password required only for email login type
      return this.loginType === 'email';
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Optional profile image URL (from iOS / social login)
  image: {
    type: String,
    trim: true
  },
  // For future monetization / coins
  coins: {
    type: Number,
    default: 0
  },
  // Subscription / plan name (Free, Basic, Premium, etc.)
  plan: {
    type: String,
    default: 'Free'
  },
  // Whether user is blocked from using app
  isBlocked: {
    type: Boolean,
    default: false
  },
  // Login type: email/password, google, apple, etc.
  loginType: {
    type: String,
    enum: ['email', 'google', 'apple'],
    default: 'email'
  },
  // Provider-specific ID (Google sub, Apple user, etc.)
  providerId: {
    type: String,
    trim: true
  },
  // Active sessions tracking (store token hashes or device info)
  activeSessions: [{
    deviceId: {
      type: String,
      trim: true
    },
    deviceInfo: {
      type: String,
      trim: true
    },
    loginAt: {
      type: Date,
      default: Date.now
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Last login timestamp
  lastLoginAt: {
    type: Date
  },
  // Token version for invalidating old tokens when forceLogin is used
  tokenVersion: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Hash password before saving (only if password exists and is modified)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

