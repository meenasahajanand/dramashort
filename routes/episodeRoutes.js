const express = require('express');
const router = express.Router();
const {
  uploadEpisode,
  uploadBatchEpisodes,
  getEpisodesBySeries,
  getEpisodeById,
  updateEpisode,
  deleteEpisode
} = require('../controllers/episodeController');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadEpisodeFiles, uploadBatchEpisodeFiles } = require('../middleware/upload');

/**
 * @route   GET /api/episodes?seriesId=xxx
 * @desc    Get all episodes for a series (by query parameter)
 * @desc    Tracks series view count if user is authenticated (unique per user)
 * @access  Public (optional auth for view tracking)
 */
router.get('/', optionalAuth, getEpisodesBySeries);

/**
 * @route   GET /api/episodes/series/:seriesId
 * @desc    Get all episodes for a series (by route parameter - for backward compatibility)
 * @desc    Tracks series view count if user is authenticated (unique per user)
 * @access  Public (optional auth for view tracking)
 */
router.get('/series/:seriesId', optionalAuth, (req, res) => {
  req.query.seriesId = req.params.seriesId;
  getEpisodesBySeries(req, res);
});

/**
 * @route   GET /api/episodes/:id
 * @desc    Get a single episode by ID
 * @access  Public
 */
router.get('/:id', getEpisodeById);

/**
 * @route   POST /api/episodes
 * @desc    Upload a single episode
 * @access  Private (requires JWT token)
 * @body    seriesId, episode (1-60), video (file, optional)
 */
router.post('/', protect, uploadEpisodeFiles, uploadEpisode);

/**
 * @route   POST /api/episodes/batch
 * @desc    Upload multiple episodes at once (max 60)
 * @access  Private (requires JWT token)
 * @body    seriesId, episodes (video files), episodeNumbers (optional JSON array)
 */
router.post('/batch', protect, uploadBatchEpisodeFiles, uploadBatchEpisodes);

/**
 * @route   PUT /api/episodes/:id
 * @desc    Update an episode
 * @access  Private (requires JWT token)
 * @body    seriesId, episode (1-60), video (file, optional)
 */
router.put('/:id', protect, uploadEpisodeFiles, updateEpisode);

/**
 * @route   DELETE /api/episodes/:id
 * @desc    Delete an episode
 * @access  Private (requires JWT token)
 */
router.delete('/:id', protect, deleteEpisode);

module.exports = router;

