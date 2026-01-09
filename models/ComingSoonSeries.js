const mongoose = require('mongoose');

const comingSoonSeriesSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  totalEpisode: {
    type: Number,
    required: true,
    min: 0
  },
  freeEpisode: {
    type: Number,
    required: true,
    min: 0
  },
  free: {
    type: Boolean,
    required: true,
    default: false
  },
  membersOnly: {
    type: Boolean,
    required: true,
    default: false
  },
  type: {
    type: String,
    enum: ['Exclusive', 'Premium', 'Free'],
    default: 'Exclusive'
  },
  active: {
    type: Boolean,
    default: true
  },
  category: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one category is required'
    }
  },
  tags: {
    type: [String],
    default: []
  },
  image: {
    type: String,
    required: true,
    trim: true
  },
  banner: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  viewCount: {
    type: Number,
    default: 0,
    min: 0
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

// Index for cron job queries
comingSoonSeriesSchema.index({ scheduledReleaseDate: 1, status: 1 });

module.exports = mongoose.model('ComingSoonSeries', comingSoonSeriesSchema);

