const BlockedIP = require('../models/BlockedIP');

// Helper function to get client IP
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
};

// Middleware to check if IP is blocked
exports.checkIPBlock = async (req, res, next) => {
  try {
    const clientIP = getClientIP(req);
    
    // Check if IP is blocked
    const blocked = await BlockedIP.findOne({ ip: clientIP });
    
    if (blocked) {
      return res.status(403).json({
        success: false,
        message: 'Your IP address has been blocked. Please contact administrator.',
        blocked: true,
        blockedAt: blocked.blockedAt,
        reason: blocked.reason
      });
    }
    
    // Attach IP to request for use in controllers
    req.clientIP = clientIP;
    next();
  } catch (error) {
    // If error checking IP, allow request (fail open)
    req.clientIP = getClientIP(req);
    next();
  }
};

// Middleware specifically for admin routes
exports.checkIPBlockAdmin = async (req, res, next) => {
  try {
    const clientIP = getClientIP(req);
    
    // Check if IP is blocked
    const blocked = await BlockedIP.findOne({ ip: clientIP });
    
    if (blocked) {
      return res.status(403).json({
        success: false,
        message: 'Your IP address has been blocked due to too many failed login attempts. Please contact administrator.',
        blocked: true,
        blockedAt: blocked.blockedAt,
        reason: blocked.reason
      });
    }
    
    req.clientIP = clientIP;
    next();
  } catch (error) {
    req.clientIP = getClientIP(req);
    next();
  }
};

