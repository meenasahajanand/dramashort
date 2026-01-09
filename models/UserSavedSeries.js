const mongoose = require('mongoose');

const userSavedSeriesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// a user can save a series only once
userSavedSeriesSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

module.exports = mongoose.model('UserSavedSeries', userSavedSeriesSchema);

