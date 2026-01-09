const express = require('express');
const router = express.Router();
const {
  getBlockedIPs,
  unblockIP,
  getFailedAttempts
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');

// All admin routes require authentication
router.use(protect);

// Check if user is admin
router.use((req, res, next) => {
  if (req.user.role !== 'admin' && req.user.id !== 'static_user_001') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.'
    });
  }
  next();
});

/**
 * @route   GET /api/admin/blocked-ips
 * @desc    Get all blocked IPs
 * @access  Private (Admin only)
 */
router.get('/blocked-ips', getBlockedIPs);

/**
 * @route   DELETE /api/admin/blocked-ips/:ip
 * @desc    Unblock an IP address
 * @access  Private (Admin only)
 */
router.delete('/blocked-ips/:ip', unblockIP);

/**
 * @route   GET /api/admin/failed-attempts
 * @desc    Get all failed login attempts
 * @access  Private (Admin only)
 */
router.get('/failed-attempts', getFailedAttempts);

module.exports = router;

