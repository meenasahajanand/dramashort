const express = require('express');
const router = express.Router();
const {
  addHistory,
  deleteHistory,
  clearHistory,
  getHistory
} = require('../controllers/historyController');

// POST /api/history - Add or update history
router.post('/', addHistory);

// GET /api/history - Get history (with query params: userId, seriesId, page, limit)
router.get('/', getHistory);

// DELETE /api/history/clear - Clear all history for a user (or user + series) - must be before /:historyId
router.delete('/clear', clearHistory);

// DELETE /api/history with query params (userId, seriesId, episodeId) - handle delete by query
router.delete('/', deleteHistory);

// DELETE /api/history/:historyId - Delete a specific history entry by ID
router.delete('/:historyId', deleteHistory);

module.exports = router;

