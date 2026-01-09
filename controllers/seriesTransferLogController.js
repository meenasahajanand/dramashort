const SeriesTransferLog = require('../models/SeriesTransferLog');

// @desc    Get all series transfer logs with pagination
// @route   GET /api/series-transfer-logs
// @access  Private (Admin only)
exports.getTransferLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await SeriesTransferLog.countDocuments();

    // Get transfer logs with pagination, sorted by most recent first
    const logs = await SeriesTransferLog.find()
      .sort({ transferredAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('seriesId', 'title image banner')
      .lean();

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching transfer logs',
      error: error.message
    });
  }
};

// @desc    Get single transfer log by ID
// @route   GET /api/series-transfer-logs/:id
// @access  Private (Admin only)
exports.getTransferLogById = async (req, res) => {
  try {
    const log = await SeriesTransferLog.findById(req.params.id)
      .populate('seriesId', 'title image banner description')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Transfer log not found'
      });
    }

    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching transfer log',
      error: error.message
    });
  }
};

