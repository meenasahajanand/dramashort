const Tag = require('../models/Tag');

// @desc    Get all tags (with search)
// @route   GET /api/tags
// @access  Public
exports.getAllTags = async (req, res) => {
  try {
    const search = req.query.search || '';
    let query = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const tags = await Tag.find(query).sort({ name: 1 }).limit(50);
    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tags',
      error: error.message
    });
  }
};

// @desc    Create a new tag
// @route   POST /api/tags
// @access  Private (Admin only)
exports.createTag = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tag name is required'
      });
    }

    const tag = await Tag.create({ name: name.trim() });
    res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      data: tag
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Tag already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating tag',
      error: error.message
    });
  }
};

