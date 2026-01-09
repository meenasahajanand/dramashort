const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  seriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Series',
    required: true,
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
  }
}, {
  timestamps: true
});

// Compound index to ensure unique episode number per series
episodeSchema.index({ seriesId: 1, episode: 1 }, { unique: true });

module.exports = mongoose.model('Episode', episodeSchema);

