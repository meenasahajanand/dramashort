const User = require('../models/User');
const CoinTransaction = require('../models/CoinTransaction');

// @desc    Get all users (admin panel)
// @route   GET /api/admin/users
// @access  Private (admin only)
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';

    // Exclude admin users always
    const query = { $and: [{ role: { $ne: 'admin' } }] };

    if (search) {
      query.$and.push({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const totalItems = await User.countDocuments(query);

    let users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Safety: double-check filter in case of legacy data
    users = users.filter(u => u.role !== 'admin');

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit),
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page * limit < totalItems,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// @desc    Add coins to user
// @route   POST /api/admin/users/coins/add
// @access  Private (admin only)
exports.addCoins = async (req, res) => {
  try {
    const userId = req.params.userId || req.body.userId;
    const { amount, description } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in request body'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Do not allow deleting admin users
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin users'
      });
    }

    const balanceBefore = user.coins || 0;
    const balanceAfter = balanceBefore + amount;

    // Update user coins
    user.coins = balanceAfter;
    await user.save();

    // Create transaction record
    await CoinTransaction.create({
      userId: user._id,
      type: 'add',
      amount: amount,
      balanceBefore,
      balanceAfter,
      description: description || `Admin added ${amount} coins`,
      adminId: req.user.id
    });

    res.status(200).json({
      success: true,
      message: `Successfully added ${amount} coins to user`,
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        coinsBefore: balanceBefore,
        coinsAfter: balanceAfter,
        amountAdded: amount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding coins',
      error: error.message
    });
  }
};

// @desc    Remove coins from user
// @route   POST /api/admin/users/coins/remove
// @access  Private (admin only)
exports.removeCoins = async (req, res) => {
  try {
    const userId = req.params.userId || req.body.userId;
    const { amount, description } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required in request body'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const balanceBefore = user.coins || 0;
    
    if (balanceBefore < amount) {
      return res.status(400).json({
        success: false,
        message: `User only has ${balanceBefore} coins. Cannot remove ${amount} coins.`
      });
    }

    const balanceAfter = balanceBefore - amount;

    // Update user coins
    user.coins = balanceAfter;
    await user.save();

    // Create transaction record
    await CoinTransaction.create({
      userId: user._id,
      type: 'remove',
      amount: amount,
      balanceBefore,
      balanceAfter,
      description: description || `Admin removed ${amount} coins`,
      adminId: req.user.id
    });

    res.status(200).json({
      success: true,
      message: `Successfully removed ${amount} coins from user`,
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        coinsBefore: balanceBefore,
        coinsAfter: balanceAfter,
        amountRemoved: amount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing coins',
      error: error.message
    });
  }
};

// @desc    Update coins (set specific amount)
// @route   PUT /api/admin/users/:userId/coins
// @access  Private (admin only)
exports.updateCoins = async (req, res) => {
  try {
    const { userId } = req.params;
    const { coins, description } = req.body;

    if (coins === undefined || coins < 0) {
      return res.status(400).json({
        success: false,
        message: 'Coins must be a non-negative number'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const balanceBefore = user.coins || 0;
    const balanceAfter = coins;
    const difference = balanceAfter - balanceBefore;

    // Update user coins
    user.coins = balanceAfter;
    await user.save();

    // Create transaction record if there's a difference
    if (difference !== 0) {
      await CoinTransaction.create({
        userId: user._id,
        type: 'admin_adjust',
        amount: Math.abs(difference),
        balanceBefore,
        balanceAfter,
        description: description || `Admin set coins to ${coins}`,
        adminId: req.user.id
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully updated user coins to ${coins}`,
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        coinsBefore: balanceBefore,
        coinsAfter: balanceAfter,
        difference: difference
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating coins',
      error: error.message
    });
  }
};

// @desc    Get user coin transaction history
// @route   GET /api/admin/users/:userId/coins/history
// @access  Private (admin only)
exports.getUserCoinHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const totalItems = await CoinTransaction.countDocuments({ userId });

    const transactions = await CoinTransaction.find({ userId })
      .populate('episodeId', 'title episode seriesId')
      .populate('adminId', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          currentCoins: user.coins || 0
        },
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit,
          hasNextPage: page * limit < totalItems,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching coin history',
      error: error.message
    });
  }
};

// @desc    Get user unlocked episodes
// @route   GET /api/admin/users/:userId/episodes
// @access  Private (admin only)
exports.getUserUnlockedEpisodes = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const UserEpisode = require('../models/UserEpisode');

    const totalItems = await UserEpisode.countDocuments({ userId });

    const unlockedEpisodes = await UserEpisode.find({ userId })
      .populate('episodeId', 'title episode coin videoUrl videoThumbnail')
      .populate('seriesId', 'title image')
      .sort({ unlockedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          currentCoins: user.coins || 0
        },
        unlockedEpisodes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit,
          hasNextPage: page * limit < totalItems,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching unlocked episodes',
      error: error.message
    });
  }
};

// @desc    Delete a user (admin)
// @route   DELETE /api/admin/users/:userId
// @access  Private (admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};


