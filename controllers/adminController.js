const BlockedIP = require('../models/BlockedIP');
const FailedLoginAttempt = require('../models/FailedLoginAttempt');

// @desc    Get all blocked IPs
// @route   GET /api/admin/blocked-ips
// @access  Private (Admin only)
exports.getBlockedIPs = async (req, res) => {
  try {
    const blockedIPs = await BlockedIP.find().sort({ blockedAt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        blockedIPs,
        count: blockedIPs.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blocked IPs',
      error: error.message
    });
  }
};

// @desc    Unblock an IP
// @route   DELETE /api/admin/blocked-ips/:ip
// @access  Private (Admin only)
exports.unblockIP = async (req, res) => {
  try {
    const { ip } = req.params;
    
    const blocked = await BlockedIP.findOneAndDelete({ ip });
    
    if (!blocked) {
      return res.status(404).json({
        success: false,
        message: 'IP not found in blocked list'
      });
    }
    
    // Also clear failed attempts for this IP
    await FailedLoginAttempt.deleteOne({ ip });
    
    res.status(200).json({
      success: true,
      message: 'IP unblocked successfully',
      data: {
        ip: blocked.ip
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error unblocking IP',
      error: error.message
    });
  }
};

// @desc    Get failed login attempts
// @route   GET /api/admin/failed-attempts
// @access  Private (Admin only)
exports.getFailedAttempts = async (req, res) => {
  try {
    const attempts = await FailedLoginAttempt.find().sort({ lastAttempt: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        attempts,
        count: attempts.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching failed attempts',
      error: error.message
    });
  }
};

