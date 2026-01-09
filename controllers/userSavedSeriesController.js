const Series = require('../models/Series');
const UserSavedSeries = require('../models/UserSavedSeries');

// POST /api/user/saved-series  (toggle: first hit saves, second hit unsaves)
// Body: { userId, seriesId } - no token required
exports.toggleSavedSeries = async (req, res) => {
  try {
    const { userId, seriesId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    if (!seriesId) {
      return res.status(400).json({ success: false, message: 'seriesId is required' });
    }

    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found' });
    }

    const existing = await UserSavedSeries.findOne({ userId, seriesId });

    if (existing) {
      await UserSavedSeries.deleteOne({ _id: existing._id });
      return res.status(200).json({ success: true, message: 'Series unsaved', isSaved: false });
    }

    await UserSavedSeries.create({ userId, seriesId });
    return res.status(200).json({ success: true, message: 'Series saved', isSaved: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to toggle saved series', error: error.message });
  }
};

// GET /api/user/saved-series?userId=xxx
// Query param: userId - no token required
exports.getSavedSeries = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required as query parameter' });
    }

    const saved = await UserSavedSeries.find({ userId })
      .populate('seriesId')
      .sort({ createdAt: -1 });

    const data = saved
      .map(entry => entry.seriesId)
      .filter(Boolean)
      .map(series => {
        const obj = series.toObject();
        obj.isSaved = true;
        return obj;
      });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch saved series', error: error.message });
  }
};

