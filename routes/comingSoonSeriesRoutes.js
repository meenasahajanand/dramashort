const express = require('express');
const router = express.Router();
const {
  createComingSoonSeries,
  getAllComingSoonSeries,
  getComingSoonSeriesById,
  updateComingSoonSeries,
  deleteComingSoonSeries
} = require('../controllers/comingSoonSeriesController');
const { protect, authorize } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload');

/**
 * @route   GET /api/coming-soon-series
 * @desc    Get all coming soon series with pagination, search, and category filter
 * @access  Public
 * @query   page, limit, search, category
 */
router.get('/', getAllComingSoonSeries);

/**
 * @route   GET /api/coming-soon-series/:id
 * @desc    Get a single coming soon series by ID
 * @access  Public
 */
router.get('/:id', getComingSoonSeriesById);

/**
 * @route   POST /api/coming-soon-series
 * @desc    Create a new coming soon series
 * @access  Private (Admin only)
 * @body    title, description, totalEpisode, freeEpisode, free, category, scheduledReleaseDate, image (file), banner (file), rating (optional)
 */
router.post('/', protect, authorize('admin'), uploadFields, createComingSoonSeries);

/**
 * @route   PUT /api/coming-soon-series/:id
 * @desc    Update a coming soon series
 * @access  Private (Admin only)
 */
router.put('/:id', protect, authorize('admin'), uploadFields, updateComingSoonSeries);

/**
 * @route   DELETE /api/coming-soon-series/:id
 * @desc    Delete a coming soon series
 * @access  Private (Admin only)
 */
router.delete('/:id', protect, authorize('admin'), deleteComingSoonSeries);

module.exports = router;

