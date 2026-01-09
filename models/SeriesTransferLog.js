const mongoose = require('mongoose');

const seriesTransferLogSchema = new mongoose.Schema({
  comingSoonSeriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ComingSoonSeries',
    required: true
  },
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  scheduledReleaseDate: {
    type: Date,
    required: true
  },
  transferredAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
seriesTransferLogSchema.index({ transferredAt: -1 });
seriesTransferLogSchema.index({ comingSoonSeriesId: 1 });
seriesTransferLogSchema.index({ seriesId: 1 });

module.exports = mongoose.model('SeriesTransferLog', seriesTransferLogSchema);

