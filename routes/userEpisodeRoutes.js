const express = require('express');
const router = express.Router();
const {
  unlockEpisode,
  getUnlockedEpisodes,
  getCoinHistory,
  checkEpisodeUnlocked,
  addCoins,
  removeCoins,
  trackEpisodeView
} = require('../controllers/userEpisodeController');
const { protect } = require('../middleware/auth');

// IMPORTANT: Order matters! More specific routes should come first

// @route   POST /api/user/coins/add
// @desc    Add coins to user (user can purchase/add coins by userId)
// @access  Public
router.post('/coins/add', addCoins);

// @route   POST /api/user/coins/remove
// @desc    Remove coins from user (user can spend/refund coins by userId)
// @access  Public
router.post('/coins/remove', removeCoins);

// @route   GET /api/user/coins/history
// @desc    Get user's coin transaction history
// @access  Private
router.get('/coins/history', protect, getCoinHistory);

// @route   GET /api/user/episodes
// @desc    Get user's unlocked episodes
// @access  Private
router.get('/episodes', protect, getUnlockedEpisodes);

// @route   GET /api/user/episodes/:episodeId/check
// @desc    Check if episode is unlocked for user
// @access  Private
router.get('/episodes/:episodeId/check', protect, checkEpisodeUnlocked);

// @route   POST /api/user/episodes/:episodeId/unlock
// @desc    Unlock episode (deduct 10 coins)
// @access  Private
router.post('/episodes/:episodeId/unlock', protect, unlockEpisode);

// @route   POST /api/user/episodes/:episodeId/view
// @desc    Track episode video view (increment series viewCount if first time)
// @access  Private
router.post('/episodes/:episodeId/view', protect, trackEpisodeView);

module.exports = router;
