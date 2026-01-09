const mongoose = require('mongoose');

const comingSoonEpisodeSchema = new mongoose.Schema({
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    index: true
  },
  comingSoonSeriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ComingSoonSeries',
    index: true
  },
  episode: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  title: {
    type: String,
    trim: true,
    default: ''
  },
  coin: {
    type: Number,
    default: 0,
    min: 0
  },
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  coinEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  videoUrl: {
    type: String,
    trim: true,
    required: true
  },
  videoThumbnail: {
    type: String,
    trim: true
  },
  scheduledReleaseDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'released'],
    default: 'pending',
    index: true
  }
}, {
  timestamps: true
});

// Compound index to ensure unique episode number per coming soon series
// (we only need uniqueness per comingSoonSeriesId, not per raw seriesId here)
comingSoonEpisodeSchema.index(
  { comingSoonSeriesId: 1, episode: 1 },
  {
    unique: true,
    // Only enforce when comingSoonSeriesId is a real ObjectId (not null/missing)
    partialFilterExpression: {
      comingSoonSeriesId: { $exists: true, $ne: null }
    }
  }
);
// Index for cron job queries
comingSoonEpisodeSchema.index({ scheduledReleaseDate: 1, status: 1 });

module.exports = mongoose.model('ComingSoonEpisode', comingSoonEpisodeSchema);

