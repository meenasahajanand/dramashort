const express = require('express');
const router = express.Router();
const {
  uploadComingSoonEpisode,
  uploadBatchComingSoonEpisodes,
  getComingSoonEpisodesBySeries,
  getAllComingSoonEpisodes,
  getComingSoonEpisodeById,
  updateComingSoonEpisode,
  deleteComingSoonEpisode
} = require('../controllers/comingSoonEpisodeController');
const { protect, authorize } = require('../middleware/auth');
const { uploadEpisodeFiles, uploadBatchEpisodeFiles } = require('../middleware/upload');

/**
 * @route   GET /api/coming-soon-episodes?seriesId=xxx OR ?comingSoonSeriesId=xxx
 * @desc    Get all coming soon episodes for a series (by query parameter)
 * @desc    If no seriesId/comingSoonSeriesId, returns all coming soon episodes
 * @access  Public
 * @query   seriesId (optional), comingSoonSeriesId (optional), page, limit, search
 */
router.get('/', (req, res) => {
  if (req.query.seriesId || req.query.comingSoonSeriesId) {
    getComingSoonEpisodesBySeries(req, res);
  } else {
    getAllComingSoonEpisodes(req, res);
  }
});

/**
 * @route   GET /api/coming-soon-episodes/:id
 * @desc    Get a single coming soon episode by ID
 * @access  Public
 */
router.get('/:id', getComingSoonEpisodeById);

/**
 * @route   POST /api/coming-soon-episodes
 * @desc    Upload a single coming soon episode
 * @access  Private (requires JWT token)
 * @body    seriesId, episode, scheduledReleaseDate, video (file), videoThumbnail (file, optional)
 */
router.post('/', protect, authorize('admin'), uploadEpisodeFiles, uploadComingSoonEpisode);

/**
 * @route   POST /api/coming-soon-episodes/batch
 * @desc    Upload multiple coming soon episodes at once
 * @access  Private (requires JWT token)
 * @body    seriesId, scheduledReleaseDate, video (files), videoThumbnail (files, optional), episodeNumbers (optional)
 */
router.post('/batch', protect, authorize('admin'), uploadBatchEpisodeFiles, uploadBatchComingSoonEpisodes);

/**
 * @route   PUT /api/coming-soon-episodes/:id
 * @desc    Update a coming soon episode
 * @access  Private (requires JWT token)
 * @body    episode, scheduledReleaseDate, video (file, optional), videoThumbnail (file, optional)
 */
router.put('/:id', protect, authorize('admin'), uploadEpisodeFiles, updateComingSoonEpisode);

/**
 * @route   DELETE /api/coming-soon-episodes/:id
 * @desc    Delete a coming soon episode
 * @access  Private (requires JWT token)
 */
router.delete('/:id', protect, authorize('admin'), deleteComingSoonEpisode);

module.exports = router;

