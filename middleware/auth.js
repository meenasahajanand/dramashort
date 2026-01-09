const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - JWT Authentication (Database Users + Static User)
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route. Please provide a valid JWT token in Authorization header as: Bearer <token>'
    });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'dramashorts_secret_key_2024_change_in_production';
    
    // Verify token
    const decoded = jwt.verify(token, jwtSecret);

    // Check if it's static user (backward compatibility)
    if (decoded.id === 'static_user_001') {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        username: 'admin'
      };
    } else {
      // Get user from database
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found. Token is invalid.'
        });
      }

      // Check token version - if token version doesn't match, token is invalid (user logged in from another device)
      const tokenVersion = decoded.tokenVersion || 0;
      const userTokenVersion = user.tokenVersion || 0;
      
      if (tokenVersion < userTokenVersion) {
        return res.status(401).json({
          success: false,
          message: 'Your session has been invalidated. You have been logged in from another device. Please login again.',
          error: 'TokenVersionMismatch'
        });
      }

      req.user = {
        id: user._id,
        email: user.email,
        role: user.role,
        username: user.username
      };
    }

    next();
  } catch (error) {
    let errorMessage = 'Not authorized to access this route';
    
    if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token. Please login again to get a new token.';
    } else if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired. Please login again to get a new token.';
    } else if (error.message) {
      errorMessage = `Token verification failed: ${error.message}`;
    }

    return res.status(401).json({
      success: false,
      message: errorMessage,
      error: error.name || 'AuthenticationError'
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

// Optional authentication - doesn't fail if no token, but sets req.user if token is valid
exports.optionalAuth = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no token, continue without setting req.user
  if (!token) {
    return next();
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'dramashorts_secret_key_2024_change_in_production';
    
    // Verify token
    const decoded = jwt.verify(token, jwtSecret);

    // Check if it's static user (backward compatibility)
    if (decoded.id === 'static_user_001') {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        username: 'admin'
      };
    } else {
      // Get user from database
      const user = await User.findById(decoded.id);
      
      if (user) {
        // Check token version
        const tokenVersion = decoded.tokenVersion || 0;
        const userTokenVersion = user.tokenVersion || 0;
        
        // Only set user if token version is valid
        if (tokenVersion >= userTokenVersion) {
          req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            username: user.username
          };
        }
      }
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without setting req.user
    // Don't throw error for optional auth
    next();
  }
};

