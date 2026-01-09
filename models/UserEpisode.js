const mongoose = require('mongoose');

const userEpisodeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  episodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Episode',
    required: true,
    index: true
  },
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true,
    index: true
  },
  coinsSpent: {
    type: Number,
    required: true,
    min: 0,
    default: 10
  },
  unlockedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure user can't unlock same episode twice
userEpisodeSchema.index({ userId: 1, episodeId: 1 }, { unique: true });

module.exports = mongoose.model('UserEpisode', userEpisodeSchema);

