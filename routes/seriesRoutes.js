const express = require('express');
const router = express.Router();
const {
  createSeries,
  getAllSeries,
  getSeriesById,
  updateSeries,
  deleteSeries,
  getTopSeriesByViews,
  getTrendingSeries,
  getCategoryTrendingSeries,
  getCategoryLatestSeries
} = require('../controllers/seriesController');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload');

/**
 * @route   GET /api/series
 * @desc    Get all series with pagination, search, and category filter
 * @access  Public
 * @query   page, limit, search, category
 */
router.get('/', optionalAuth, getAllSeries);

/**
 * @route   GET /api/series/trending
 * @desc    Get trending series (latest 20 releases, sorted by trending: new release + high views)
 * @access  Public
 * @query   userId (optional, for isSaved flag)
 */
router.get('/trending', optionalAuth, getTrendingSeries);

/**
 * @route   GET /api/series/top/views
 * @desc    Get top 10 series by view count (sorted by viewCount descending)
 * @access  Public
 * @query   limit (optional, default: 10)
 */
router.get('/top/views', optionalAuth, getTopSeriesByViews);

/**
 * @route   GET /api/series/category/trending
 * @desc    Get category-wise trending series (latest releases with high views)
 * @access  Public
 * @query   category (required), page, limit, userId (optional, for isSaved flag)
 */
router.get('/category/trending', optionalAuth, getCategoryTrendingSeries);

/**
 * @route   GET /api/series/category/latest
 * @desc    Get category-wise latest series (new releases)
 * @access  Public
 * @query   category (required), page, limit, userId (optional, for isSaved flag)
 */
router.get('/category/latest', optionalAuth, getCategoryLatestSeries);

/**
 * @route   GET /api/series/:id
 * @desc    Get a single series by ID
 * @access  Public
 */
router.get('/:id', optionalAuth, getSeriesById);

/**
 * @route   POST /api/series
 * @desc    Create a new series
 * @access  Private (Admin only)
 * @body    title, description, totalEpisode, freeEpisode, free, category, image (file), banner (file)
 */
router.post('/', protect, authorize('admin'), uploadFields, createSeries);

/**
 * @route   PUT /api/series/:id
 * @desc    Update a series (full update)
 * @access  Private (Admin only)
 * @body    title, description, totalEpisode, freeEpisode, free, category, image (file), banner (file)
 */
router.put('/:id', protect, authorize('admin'), uploadFields, updateSeries);

/**
 * @route   DELETE /api/series/:id
 * @desc    Delete a series
 * @access  Private (Admin only)
 */
router.delete('/:id', protect, authorize('admin'), deleteSeries);

module.exports = router;

