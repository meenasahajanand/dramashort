const express = require('express');
const router = express.Router();
const {
  getTransferLogs,
  getTransferLogById
} = require('../controllers/seriesTransferLogController');
const { protect, authorize } = require('../middleware/auth');

/**
 * @route   GET /api/series-transfer-logs
 * @desc    Get all series transfer logs with pagination
 * @access  Private (Admin only)
 * @query   page, limit
 */
router.get('/', protect, authorize('admin'), getTransferLogs);

/**
 * @route   GET /api/series-transfer-logs/:id
 * @desc    Get single transfer log by ID
 * @access  Private (Admin only)
 */
router.get('/:id', protect, authorize('admin'), getTransferLogById);

module.exports = router;

