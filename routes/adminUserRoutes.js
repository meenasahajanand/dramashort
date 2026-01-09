const express = require('express');
const router = express.Router();
const { 
  getUsers, 
  addCoins, 
  removeCoins, 
  updateCoins, 
  getUserCoinHistory,
  getUserUnlockedEpisodes,
  deleteUser
} = require('../controllers/adminUserController');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/admin/users
// @desc    Get all users (admin panel list)
// @access  Private (admin only)
router.get('/', protect, authorize('admin'), getUsers);

// @route   POST /api/admin/users/coins/add
// @desc    Add coins to user
// @access  Private (admin only)
router.post('/coins/add', protect, authorize('admin'), addCoins);
router.post('/:userId/coins/add', protect, authorize('admin'), addCoins);

// @route   POST /api/admin/users/coins/remove
// @desc    Remove coins from user
// @access  Private (admin only)
router.post('/coins/remove', protect, authorize('admin'), removeCoins);
router.post('/:userId/coins/remove', protect, authorize('admin'), removeCoins);

// @route   PUT /api/admin/users/:userId/coins
// @desc    Update coins (set specific amount)
// @access  Private (admin only)
router.put('/:userId/coins', protect, authorize('admin'), updateCoins);

// @route   GET /api/admin/users/:userId/coins/history
// @desc    Get user coin transaction history
// @access  Private (admin only)
router.get('/:userId/coins/history', protect, authorize('admin'), getUserCoinHistory);

// @route   GET /api/admin/users/:userId/episodes
// @desc    Get user unlocked episodes
// @access  Private (admin only)
router.get('/:userId/episodes', protect, authorize('admin'), getUserUnlockedEpisodes);

// @route   DELETE /api/admin/users/:userId
// @desc    Delete a user (admin only)
router.delete('/:userId', protect, authorize('admin'), deleteUser);

module.exports = router;


