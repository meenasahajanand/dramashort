const History = require('../models/History');
const Series = require('../models/Series');
const UserSavedSeries = require('../models/UserSavedSeries');
const mongoose = require('mongoose');

// Convert stored path to absolute URL using current request host
const fixFileUrl = (req, url) => {
  if (!url) return url;
  
  // If URL is already a DigitalOcean Spaces URL, return as is
  if (url.includes('digitaloceanspaces.com')) {
    return url;
  }
  
  // If URL already starts with http, return as is
  if (url.startsWith('http')) return url;
  
  // Fallback to local storage URL
  return `${req.protocol}://${req.get('host')}${url.startsWith('/') ? url : `/${url}`}`;
};

// POST /api/history - Add or update history
// Body: { userId, seriesId }
exports.addHistory = async (req, res) => {
  try {
    const { userId, seriesId } = req.body;

    // Validation
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    if (!seriesId) {
      return res.status(400).json({ success: false, message: 'seriesId is required' });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId format' });
    }
    if (!mongoose.Types.ObjectId.isValid(seriesId)) {
      return res.status(400).json({ success: false, message: 'Invalid seriesId format' });
    }

    // Check if series exists
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    // Upsert: update if exists, create if not (based on userId + seriesId)
    const history = await History.findOneAndUpdate(
      { userId, seriesId },
      {
        userId,
        seriesId,
        watchedAt: new Date()
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'History added successfully',
      data: history
    });
  } catch (error) {
    console.error('Error adding history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add history',
      error: error.message
    });
  }
};

// DELETE /api/history/:historyId - Delete a specific history entry by ID
// OR DELETE /api/history?userId=xxx&seriesId=xxx - Delete by query params
exports.deleteHistory = async (req, res) => {
  try {
    const { historyId } = req.params;
    const { userId, seriesId } = req.query;

    let query = {};

    // If historyId is provided, delete by ID
    if (historyId) {
      if (!mongoose.Types.ObjectId.isValid(historyId)) {
        return res.status(400).json({ success: false, message: 'Invalid historyId format' });
      }
      query._id = historyId;
    } else {
      // Otherwise, use query parameters
      if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required (either as historyId in params or userId in query)' });
      }
      if (!seriesId) {
        return res.status(400).json({ success: false, message: 'seriesId is required when using query parameters' });
      }

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ success: false, message: 'Invalid userId format' });
      }
      if (!mongoose.Types.ObjectId.isValid(seriesId)) {
        return res.status(400).json({ success: false, message: 'Invalid seriesId format' });
      }

      query.userId = userId;
      query.seriesId = seriesId;
    }

    const deleted = await History.deleteOne(query);

    if (deleted.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'History not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'History deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete history',
      error: error.message
    });
  }
};

// DELETE /api/history/clear - Clear all history for a user (or user + series)
// Body: { userId, seriesId (optional) }
exports.clearHistory = async (req, res) => {
  try {
    const { userId, seriesId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId format' });
    }

    let query = { userId };

    if (seriesId) {
      if (!mongoose.Types.ObjectId.isValid(seriesId)) {
        return res.status(400).json({ success: false, message: 'Invalid seriesId format' });
      }
      query.seriesId = seriesId;
    }

    const result = await History.deleteMany(query);

    return res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} history entries`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error clearing history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear history',
      error: error.message
    });
  }
};

// GET /api/history?userId=xxx&seriesId=xxx (optional) - Get history
exports.getHistory = async (req, res) => {
  try {
    const { userId, seriesId } = req.query;

    // Accept page/limit from query params or headers
    const rawPage = req.query.page ?? req.headers['page'];
    const rawLimit = req.query.limit ?? req.headers['limit'];
    const pageNum = Math.max(1, parseInt(rawPage, 10) || 1);
    const limitNum = Math.max(1, parseInt(rawLimit, 10) || 20);

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required as query parameter' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId format' });
    }

    let query = { userId };

    if (seriesId) {
      if (!mongoose.Types.ObjectId.isValid(seriesId)) {
        return res.status(400).json({ success: false, message: 'Invalid seriesId format' });
      }
      query.seriesId = seriesId;
    }

    const skip = (pageNum - 1) * limitNum;

    // Fetch history entries (sorted by latest watched first)
    const historyEntries = await History.find(query)
      .sort({ watchedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Collect unique seriesIds from history
    const seriesIds = historyEntries.map(h => h.seriesId);

    // Fetch full series details for these IDs
    const seriesList = await Series.find({ _id: { $in: seriesIds } });

    // Build a map for quick lookup
    const seriesMap = new Map();
    seriesList.forEach(s => seriesMap.set(String(s._id), s));

    // Get saved series IDs for this user
    let savedIds = [];
    if (userId) {
      const saved = await UserSavedSeries.find({ userId }, 'seriesId');
      savedIds = saved.map(s => String(s.seriesId));
    }

    // Prepare response data: merge series details with isSaved flag, fix URLs and include watchedAt
    const data = historyEntries
      .map(entry => {
        const series = seriesMap.get(String(entry.seriesId));
        if (!series) return null;

        const seriesObj = series.toObject();
        // Always include absolute image and banner URLs
        seriesObj.image = seriesObj.image ? fixFileUrl(req, seriesObj.image) : null;
        seriesObj.banner = seriesObj.banner ? fixFileUrl(req, seriesObj.banner) : null;
        seriesObj.isSaved = savedIds.includes(String(seriesObj._id));

        // Keep watchedAt to show when user watched it (ISO string)
        seriesObj.watchedAt = entry.watchedAt ? entry.watchedAt.toISOString() : null;

        return seriesObj;
      })
      .filter(Boolean);

    const total = await History.countDocuments(query);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch history',
      error: error.message
    });
  }
};

