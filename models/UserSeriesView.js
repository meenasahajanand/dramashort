const mongoose = require('mongoose');

const userSeriesViewSchema = new mongoose.Schema({
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
  },
  firstViewedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure one view per user per series
userSeriesViewSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

module.exports = mongoose.model('UserSeriesView', userSeriesViewSchema);

