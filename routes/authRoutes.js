const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  loginWithGoogle,
  loginWithApple,
  logout,
  logoutOtherDevices,
  deleteAccount,
  adminLogin
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { checkIPBlockAdmin } = require('../middleware/ipBlock');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    username, email, password, role (optional)
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user (database users + static user for backward compatibility)
 * @access  Public
 * @body    email, password
 */
router.post('/login', login);

/**
 * @route   POST /api/auth/admin/login
 * @desc    Admin login for Dashboard (ONLY static admin from .env)
 * @access  Public
 * @body    email, password
 * @note    IP blocking: 5 failed attempts will block IP
 */
router.post('/admin/login', checkIPBlockAdmin, adminLogin);

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private (requires JWT token)
 */
router.get('/me', protect, getMe);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (remove current device session) - Works without token
 * @access  Public (email and password required in body)
 * @body    email (required), password (required), deviceId (optional)
 */
router.post('/logout', logout);

/**
 * @route   POST /api/auth/google
 * @desc    Login/Signup with Google
 * @access  Public
 * @body    email, name, image (optional), providerId (required)
 */
router.post('/google', loginWithGoogle);

/**
 * @route   POST /api/auth/apple
 * @desc    Login/Signup with Apple
 * @access  Public
 * @body    email (optional), name (optional), image (optional), providerId (required)
 */
router.post('/apple', loginWithApple);

/**
 * @route   POST /api/auth/logout-other-devices
 * @desc    Logout from other devices (keep current device logged in)
 * @access  Private
 * @body    deviceId (optional) - Current device ID to keep
 */
router.post('/logout-other-devices', protect, logoutOtherDevices);

/**
 * @route   POST /api/auth/delete-account
 * @desc    Delete current user account using token in body (same as logout)
 * @access  Public
 */
router.post('/delete-account', deleteAccount);

module.exports = router;

