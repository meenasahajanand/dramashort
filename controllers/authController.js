const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserEpisode = require('../models/UserEpisode');
const CoinTransaction = require('../models/CoinTransaction');
const BlockedIP = require('../models/BlockedIP');
const FailedLoginAttempt = require('../models/FailedLoginAttempt');

// Static Admin User Credentials - ONLY THIS USER CAN LOGIN
// Configure via .env or use defaults
const STATIC_USER = {
  id: 'static_user_001',
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@dramashorts.com',
  password: process.env.ADMIN_PASSWORD || 'Admin@DramaShorts2024!', // Strong password
  role: 'admin'
};

// Generate JWT Token
const generateToken = (userData, tokenVersion = 0) => {
  const jwtSecret = process.env.JWT_SECRET || 'dramashorts_secret_key_2024_change_in_production';
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    { 
      id: userData.id || userData._id,
      email: userData.email,
      role: userData.role,
      tokenVersion: tokenVersion // Include token version to invalidate old tokens
    }, 
    jwtSecret, 
    {
      expiresIn: process.env.JWT_EXPIRE || '30d'
    }
  );
};

// Check if user has active session (logged in on another device)
const checkActiveSession = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return false;
    
    // Simply check if user has any active sessions
    // If logout was called, activeSessions will be empty array, so this returns false
    const hasActiveSessions = user.activeSessions && user.activeSessions.length > 0;
    
    return hasActiveSessions;
  } catch (error) {
    return false;
  }
};

// Validate password strength
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long` };
  }
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!hasNumbers) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }

  return { valid: true };
};

// @desc    Register new user (for mobile app)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { username, email, password, role, providerId, deviceId, deviceInfo } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username, email, and password'
      });
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate username length
    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters long'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if user already exists (by email only)
    const existingUser = await User.findOne({
      email: email.toLowerCase()
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user (password will be hashed by pre-save hook)
    let user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password, // Will be hashed automatically
      role: role && role === 'admin' ? 'admin' : 'user', // Only allow admin if explicitly set
      providerId: providerId || undefined
    });

    // After successful registration, create an initial active session
    // so that login from another device can detect "already logged in"
    try {
      // Ensure activeSessions array exists
      if (!user.activeSessions || !Array.isArray(user.activeSessions)) {
        user.activeSessions = [];
      }

      const finalDeviceId =
        deviceId || `register_device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Avoid duplicate deviceId entries
      user.activeSessions = user.activeSessions.filter(
        (session) => session.deviceId !== finalDeviceId
      );

      user.activeSessions.push({
        deviceId: finalDeviceId,
        deviceInfo: deviceInfo || 'Registration Device',
        loginAt: new Date(),
        lastActiveAt: new Date()
      });

      user.lastLoginAt = new Date();
      await user.save();
    } catch (sessionError) {
      // Session creation failure should not block registration
      console.warn('Could not create initial active session on register:', sessionError.message);
    }

    // Generate token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      providerId: user.providerId || null,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    // Handle duplicate key error (unique constraint)
    if (error.code === 11000) {
      const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'email';
      let message = 'Duplicate value already exists';

      if (field === 'email') {
        message = 'Email already exists';
      } else if (field === 'username') {
        message = 'Username already exists';
      }

      return res.status(400).json({
        success: false,
        message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
};

// @desc    Unified Login - Handles Email, Google, and Apple login
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      loginType, // 'email', 'google', 'apple'
      providerId, // For Google/Apple
      name, // For Google/Apple
      image, // For Google/Apple
      forceLogin, 
      deviceId, 
      deviceInfo 
    } = req.body;

    // Determine login type
    let authType = loginType;
    if (!authType) {
      if (providerId) {
        // Check if it's Apple (has privaterelay email or no email) or Google
        if (email && email.includes('@privaterelay.app')) {
          authType = 'apple';
        } else if (!email) {
          authType = 'apple';
        } else {
          authType = 'google';
        }
      } else {
        authType = 'email';
      }
    }

    // Validation based on login type
    if (authType === 'email') {
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide email and password for email login'
        });
      }
    } else if (authType === 'google') {
      if (!email || !providerId) {
        return res.status(400).json({
          success: false,
          message: 'Email and providerId are required for Google login'
        });
      }
    } else if (authType === 'apple') {
      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: 'ProviderId is required for Apple login'
        });
      }
    }

    let user = null;
    let isStaticUser = false;

    // Handle Email Login - Normal user login (for mobile app)
    if (authType === 'email') {
      // First check static user (for backward compatibility)
      if (email === STATIC_USER.email && password === STATIC_USER.password) {
        user = STATIC_USER;
        isStaticUser = true;
      } else {
        // Check database for registered users (normal mobile app users)
        user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }

        // Verify password
        const isPasswordValid = await user.matchPassword(password);
        if (!isPasswordValid) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }
      }
    }
    // Handle Google Login (for mobile app)
    else if (authType === 'google') {
      // Check if user exists with this email or providerId
      user = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { providerId: providerId }
        ]
      });

      if (user) {
        // Update user info if needed
        if (!user.providerId) user.providerId = providerId;
        if (!user.loginType || user.loginType === 'email') user.loginType = 'google';
        if (image && !user.image) user.image = image;
        if (name && !user.username) user.username = name;
        // Ensure activeSessions array exists
        if (!user.activeSessions) {
          user.activeSessions = [];
        }
      } else {
        // Create new user
        const username = name || email.split('@')[0] || `user_${Date.now()}`;
        let finalUsername = username;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${username}_${counter}`;
          counter++;
        }

        user = await User.create({
          username: finalUsername,
          email: email.toLowerCase(),
          loginType: 'google',
          providerId: providerId,
          image: image || null,
          password: undefined,
          activeSessions: [],
          lastLoginAt: new Date()
        });
      }
    }
    // Handle Apple Login (for mobile app)
    else if (authType === 'apple') {
      // Check if user exists with providerId first
      user = await User.findOne({ providerId: providerId });

      if (!user && email) {
        user = await User.findOne({ email: email.toLowerCase() });
      }

      if (user) {
        // Update user info if needed
        if (!user.providerId) user.providerId = providerId;
        if (!user.loginType || user.loginType === 'email') user.loginType = 'apple';
        if (email && !user.email) user.email = email.toLowerCase();
        if (image && !user.image) user.image = image;
        if (name && !user.username) user.username = name;
        // Ensure activeSessions array exists
        if (!user.activeSessions) {
          user.activeSessions = [];
        }
      } else {
        // Create new user
        const userEmail = email || `${providerId}@apple.privaterelay.app`;
        const username = name || email?.split('@')[0] || `apple_user_${Date.now()}`;
        let finalUsername = username;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${username}_${counter}`;
          counter++;
        }

        user = await User.create({
          username: finalUsername,
          email: userEmail.toLowerCase(),
          loginType: 'apple',
          providerId: providerId,
          image: image || null,
          password: undefined,
          activeSessions: [],
          lastLoginAt: new Date()
        });
      }
    }

    // For database users, check active session and handle device management
    if (!isStaticUser && user && user._id) {
      // Ensure user is saved before checking sessions (for newly created users)
      if (user.isNew || user.isModified()) {
        await user.save();
      }
      
      // Fetch fresh user data to get latest activeSessions
      const freshUser = await User.findById(user._id);
      if (!freshUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Ensure activeSessions is properly initialized
      if (!freshUser.activeSessions || !Array.isArray(freshUser.activeSessions)) {
        freshUser.activeSessions = [];
      }
      
      // MULTI-DEVICE LOGIN ENABLED - Commented out single device restriction
      // Allow multiple devices to login simultaneously
      // No need to check for existing sessions or force logout
      
      // OLD CODE (COMMENTED) - Single device login restriction
      // const hasActiveSession = freshUser.activeSessions.length > 0;
      // if (hasActiveSession && !forceLogin) {
      //   return res.status(200).json({
      //     success: true,
      //     message: 'User already logged in on another device',
      //     alreadyLoggedIn: true,
      //     data: {
      //       message: 'You are already logged in on another device. Do you want to logout from other device and login here?',
      //       options: {
      //         continueLogin: 'Login anyway (keep other device logged in)',
      //         logoutOther: 'Logout other device and login here'
      //       }
      //     }
      //   });
      // }
      // if (forceLogin && hasActiveSession) {
      //   freshUser.activeSessions = [];
      //   freshUser.tokenVersion = (freshUser.tokenVersion || 0) + 1;
      // }

      // Always add new session (even if no deviceId provided, we'll generate one)
      // This ensures session tracking works for all login types
      if (!freshUser.activeSessions) {
        freshUser.activeSessions = [];
      }
      
      // Generate deviceId if not provided (for API calls without deviceId)
      const finalDeviceId = deviceId || `api_device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Remove existing session with same deviceId if exists (to avoid duplicates)
      freshUser.activeSessions = freshUser.activeSessions.filter(
        session => session.deviceId !== finalDeviceId
      );
      
      // Add new session
      freshUser.activeSessions.push({
        deviceId: finalDeviceId,
        deviceInfo: deviceInfo || 'API Client',
        loginAt: new Date(),
        lastActiveAt: new Date()
      });

      // Update last login
      freshUser.lastLoginAt = new Date();
      await freshUser.save();
      
      // Update user reference for token generation
      user = freshUser;
    }

    // Generate token with tokenVersion
    const tokenVersion = isStaticUser ? 0 : (user.tokenVersion || 0);
    const token = generateToken(user, tokenVersion);

    // Prepare user response with all fields for iOS
    const userResponse = isStaticUser ? {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      image: null,
      coins: 0,
      plan: 'Free',
      isBlocked: false,
      loginType: 'email',
      createdAt: new Date().toISOString()
    } : {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      image: user.image || null,
      coins: user.coins || 0,
      plan: user.plan || 'Free',
      isBlocked: user.isBlocked || false,
      loginType: user.loginType || 'email',
      providerId: user.providerId || null,
      createdAt: user.createdAt || new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      alreadyLoggedIn: false,
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // If static user, return static data
    if (req.user.id === 'static_user_001') {
      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: req.user.id,
            username: req.user.username || STATIC_USER.username,
            email: req.user.email,
            role: req.user.role || STATIC_USER.role,
            image: null,
            coins: 0,
            plan: 'Free',
            isBlocked: false,
            loginType: 'email'
          }
        }
      });
    }

    // Get full user data from database
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          image: user.image || null,
          coins: user.coins || 0,
          plan: user.plan || 'Free',
          isBlocked: user.isBlocked || false,
          loginType: user.loginType || 'email',
          providerId: user.providerId || null,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

// @desc    Login/Signup with Google (Calls unified login internally)
// @route   POST /api/auth/google
// @access  Public
exports.loginWithGoogle = async (req, res) => {
  // Redirect to unified login
  req.body.loginType = 'google';
  return exports.login(req, res);
};

// @desc    Login/Signup with Apple (Calls unified login internally)
// @route   POST /api/auth/apple
// @access  Public
exports.loginWithApple = async (req, res) => {
  // Redirect to unified login
  req.body.loginType = 'apple';
  return exports.login(req, res);
};

// Helper function to get client IP
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
};

// Helper function to check if IP is blocked
const isIPBlocked = async (ip) => {
  const blocked = await BlockedIP.findOne({ ip });
  return !!blocked;
};

// Helper function to record failed login attempt
const recordFailedAttempt = async (ip, email) => {
  const maxAttempts = 5;
  
  // Find or create failed attempt record
  let attempt = await FailedLoginAttempt.findOne({ ip });
  
  if (!attempt) {
    attempt = await FailedLoginAttempt.create({
      ip,
      email,
      attempts: 1,
      firstAttempt: new Date(),
      lastAttempt: new Date()
    });
  } else {
    // Reset attempts if last attempt was more than 1 hour ago
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (attempt.lastAttempt < oneHourAgo) {
      attempt.attempts = 1;
      attempt.firstAttempt = new Date();
    } else {
      attempt.attempts += 1;
    }
    attempt.lastAttempt = new Date();
    attempt.email = email;
    await attempt.save();
  }
  
  // Block IP if attempts exceed max
  if (attempt.attempts >= maxAttempts) {
    // Check if already blocked
    const existingBlock = await BlockedIP.findOne({ ip });
    if (!existingBlock) {
      await BlockedIP.create({
        ip,
        reason: `Too many failed login attempts (${attempt.attempts})`,
        attempts: attempt.attempts
      });
    }
    return { blocked: true, attempts: attempt.attempts };
  }
  
  return { blocked: false, attempts: attempt.attempts, remaining: maxAttempts - attempt.attempts };
};

// Helper function to clear failed attempts on successful login
const clearFailedAttempts = async (ip) => {
  await FailedLoginAttempt.deleteOne({ ip });
};

// @desc    Admin Login - ONLY for Dashboard (Static admin only from .env)
// @route   POST /api/auth/admin/login
// @access  Public
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIP = getClientIP(req);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check if IP is blocked
    const ipBlocked = await isIPBlocked(clientIP);
    if (ipBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your IP address has been blocked due to too many failed login attempts. Please contact administrator.',
        blocked: true
      });
    }

    // ONLY static admin can login for dashboard
    // Case-insensitive email comparison
    const inputEmail = email.toLowerCase().trim();
    const staticEmail = STATIC_USER.email.toLowerCase().trim();
    const emailMatch = inputEmail === staticEmail;
    const passwordMatch = password === STATIC_USER.password;
    
    // Debug logging (remove in production if needed)
    console.log('Admin Login Attempt:');
    console.log('  Input Email:', email);
    console.log('  Static Email:', STATIC_USER.email);
    console.log('  Email Match:', emailMatch);
    console.log('  Password Match:', passwordMatch ? 'YES' : 'NO');
    console.log('  Client IP:', clientIP);
    
    if (emailMatch && passwordMatch) {
      // Clear failed attempts on successful login
      await clearFailedAttempts(clientIP);
      
      const user = STATIC_USER;
      const token = generateToken(user, 0);

      const userResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        image: null,
        coins: 0,
        plan: 'Free',
        isBlocked: false,
        loginType: 'email',
        createdAt: new Date().toISOString()
      };

      return res.status(200).json({
        success: true,
        message: 'Admin login successful',
        data: {
          user: userResponse,
          token
        }
      });
    } else {
      // Record failed attempt
      const attemptResult = await recordFailedAttempt(clientIP, email);
      
      if (attemptResult.blocked) {
        return res.status(403).json({
          success: false,
          message: 'Your IP address has been blocked due to too many failed login attempts. Please contact administrator.',
          blocked: true,
          attempts: attemptResult.attempts
        });
      }
      
      return res.status(401).json({
        success: false,
        message: `Invalid admin credentials. ${attemptResult.remaining} attempt(s) remaining before IP block.`,
        attempts: attemptResult.attempts,
        remaining: attemptResult.remaining
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
};

// @desc    Logout user (remove current device session) - Token required in body
// @route   POST /api/auth/logout
// @access  Public (token or userId required in body)
exports.logout = async (req, res) => {
  try {
    const { token, deviceId, userId } = req.body;

    let user = null;
    let isStaticUser = false;

    // If userId is provided, use it directly (priority over token)
    if (userId) {
      // Skip static users
      if (userId === 'static_user_001') {
        isStaticUser = true;
        user = STATIC_USER;
      } else {
        // Get user from database by userId
        user = await User.findById(userId);
        
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'User not found with provided userId'
          });
        }
      }
    } else if (token) {
      // If no userId, use token (backward compatibility)
      let decoded = null;

      try {
        // Verify token
        const jwtSecret = process.env.JWT_SECRET || 'dramashorts_secret_key_2024_change_in_production';
        decoded = jwt.verify(token, jwtSecret);

        // Check if it's static user
        if (decoded.id === 'static_user_001') {
          isStaticUser = true;
          user = STATIC_USER;
        } else {
          // Get user from database
          user = await User.findById(decoded.id);
          
          if (!user) {
            return res.status(401).json({
              success: false,
              message: 'User not found. Token is invalid.'
            });
          }
        }
      } catch (error) {
        let errorMessage = 'Invalid token';
        
        if (error.name === 'JsonWebTokenError') {
          errorMessage = 'Invalid token. Please provide a valid token.';
        } else if (error.name === 'TokenExpiredError') {
          errorMessage = 'Token has expired. Please login again.';
        }

        return res.status(401).json({
          success: false,
          message: errorMessage
        });
      }
    } else {
      // Neither userId nor token provided
      return res.status(400).json({
        success: false,
        message: 'Either userId or token is required in request body'
      });
    }

    // If user found, remove device session
    if (!isStaticUser && user && user._id) {
      // Always clear all sessions on logout to ensure clean state
      // This ensures user can login again without "already logged in" message
      user.activeSessions = [];
      
      // Clear lastLoginAt to null so checkActiveSession returns false
      user.lastLoginAt = null;
      
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Logout successful',
      data: {
        message: 'You have been logged out successfully'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error logging out',
      error: error.message
    });
  }
};

// @desc    Logout from other devices
// @route   POST /api/auth/logout-other-devices
// @access  Private
exports.logoutOtherDevices = async (req, res) => {
  try {
    const { deviceId } = req.body; // Current device ID to keep logged in

    if (req.user.id === 'static_user_001') {
      return res.status(200).json({
        success: true,
        message: 'Other devices logged out successfully'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Keep only current device session, remove others
    if (deviceId && user.activeSessions && user.activeSessions.length > 0) {
      user.activeSessions = user.activeSessions.filter(
        session => session.deviceId === deviceId
      );
    } else {
      // If no deviceId provided, clear all sessions
      user.activeSessions = [];
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Other devices logged out successfully',
      data: {
        remainingSessions: user.activeSessions.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error logging out other devices',
      error: error.message
    });
  }
};

// @desc    Delete current user account (and related data) using JWT token in body (same as logout)
// @route   POST /api/auth/delete-account
// @access  Public (token required in body)
exports.deleteAccount = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required in request body'
      });
    }

    let decoded = null;
    let user = null;

    try {
      const jwtSecret = process.env.JWT_SECRET || 'dramashorts_secret_key_2024_change_in_production';
      decoded = jwt.verify(token, jwtSecret);

      // Do not allow deleting static admin account
      if (decoded.id === STATIC_USER.id) {
        return res.status(400).json({
          success: false,
          message: 'Static admin account cannot be deleted'
        });
      }

      user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found. Token is invalid.'
        });
      }
    } catch (error) {
      let errorMessage = 'Invalid token';

      if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token. Please provide a valid token.';
      } else if (error.name === 'TokenExpiredError') {
        errorMessage = 'Token has expired. Please login again.';
      }

      return res.status(401).json({
        success: false,
        message: errorMessage
      });
    }

    const userId = user._id;

    // Delete related data: unlocked episodes and coin transactions
    await Promise.all([
      UserEpisode.deleteMany({ userId }),
      CoinTransaction.deleteMany({ userId })
    ]);

    // Finally delete user account
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'User account deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting user account',
      error: error.message
    });
  }
};

