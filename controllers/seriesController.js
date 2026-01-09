const Series = require('../models/Series');
const path = require('path');
const mongoose = require('mongoose');
const UserSavedSeries = require('../models/UserSavedSeries');

// Helper to compute a stable base URL for serving files
// Prefer FILE_BASE_URL / BASE_URL env so URLs always point to the backend server
const getBaseUrl = (req) => {
  if (process.env.FILE_BASE_URL) return process.env.FILE_BASE_URL;
  if (process.env.BASE_URL) return process.env.BASE_URL;
  // Use request to get the actual host and protocol
  if (req) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
    return `${protocol}://${host}`;
  }
  // Fallback if no request object
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
};

// Helper function to get file URL
const getFileUrl = (req, file) => {
  if (!file) return null;
  
  // If file is uploaded to DigitalOcean Spaces, use the location from S3
  if (file.location) {
    return file.location; // multer-s3 provides file.location with full Spaces URL
  }
  
  // Fallback to local storage
  const baseUrl = getBaseUrl(req);
  return `${baseUrl}/uploads/${file.filename}`;
};

// Helper function to fix existing URLs in database to use current request host
const fixFileUrl = (req, url) => {
  if (!url || typeof url !== 'string') return url;
  
  // If URL is already a DigitalOcean Spaces URL, return as is
  if (url.includes('digitaloceanspaces.com')) {
    return url;
  }
  
  // If URL already contains /uploads/, replace the host part with current host (local storage)
  if (url.includes('/uploads/')) {
    const filename = url.split('/uploads/')[1];
    const baseUrl = getBaseUrl(req);
    return `${baseUrl}/uploads/${filename}`;
  }
  
  return url;
};

// @desc    Create a new series
// @route   POST /api/series
// @access  Private
exports.createSeries = async (req, res) => {
  try {
    // Helper to clean and parse form-data values
    const cleanValue = (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'string') {
        // Remove surrounding quotes if present
        let cleaned = value.trim();
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
          cleaned = cleaned.slice(1, -1);
        }
        return cleaned || undefined;
      }
      return value;
    };

    let { title, description, totalEpisode, freeEpisode, free, membersOnly, category, type, active, tags, rating } = req.body;
    
    // Clean all string values
    title = cleanValue(title);
    description = cleanValue(description);
    totalEpisode = cleanValue(totalEpisode);
    freeEpisode = cleanValue(freeEpisode);
    free = cleanValue(free);
    membersOnly = cleanValue(membersOnly);
    category = cleanValue(category);

    // Parse category if it's a string (from form-data)
    let categoryArray = category;
    if (category && typeof category === 'string') {
      try {
        categoryArray = JSON.parse(category);
      } catch (e) {
        // If not JSON, treat as comma-separated string
        categoryArray = category.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      }
    }

    // Parse tags if it's a string (from form-data)
    let tagsArray = [];
    if (tags) {
      if (typeof tags === 'string') {
        try {
          tagsArray = JSON.parse(tags);
        } catch (e) {
          // If not JSON, treat as comma-separated string
          tagsArray = tags.split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
        }
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    // Get file paths from uploaded files
    const imageFile = req.files && req.files['image'] ? req.files['image'][0] : null;
    const bannerFile = req.files && req.files['banner'] ? req.files['banner'][0] : null;

    // Get image URLs - prefer uploaded files, fallback to body
    const image = imageFile ? getFileUrl(req, imageFile) : (req.body.image ? cleanValue(req.body.image) : null);
    const banner = bannerFile ? getFileUrl(req, bannerFile) : (req.body.banner ? cleanValue(req.body.banner) : null);

    // Validation with detailed error messages
    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!description) missingFields.push('description');
    if (totalEpisode === undefined || totalEpisode === null || totalEpisode === '') missingFields.push('totalEpisode');
    if (freeEpisode === undefined || freeEpisode === null || freeEpisode === '') missingFields.push('freeEpisode');
    // free is optional, default to false if not provided
    // if (free === undefined || free === null || free === '') missingFields.push('free');
    if (!categoryArray || !Array.isArray(categoryArray) || categoryArray.length === 0) missingFields.push('category');
    if (!image) missingFields.push('image');
    if (!banner) missingFields.push('banner');

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields
      });
    }

    // Parse numbers and boolean
    const parsedTotalEpisode = parseInt(totalEpisode);
    const parsedFreeEpisode = parseInt(freeEpisode);
    const parsedFree = free === 'true' || free === true || free === 'True';
    const parsedMembersOnly = membersOnly === 'true' || membersOnly === true || membersOnly === 'True' || false; // Default to false if not provided

    if (isNaN(parsedTotalEpisode) || parsedTotalEpisode < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'totalEpisode must be a valid non-negative number' 
      });
    }

    if (isNaN(parsedFreeEpisode) || parsedFreeEpisode < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'freeEpisode must be a valid non-negative number' 
      });
    }

    // Parse rating
    let parsedRating = 0;
    if (rating !== undefined && rating !== null && rating !== '') {
      parsedRating = parseFloat(rating);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 10) {
        return res.status(400).json({ 
          success: false, 
          message: 'rating must be a number between 1 and 10' 
        });
      }
    }

    const series = new Series({
      title,
      description,
      totalEpisode: parsedTotalEpisode,
      freeEpisode: parsedFreeEpisode,
      free: parsedFree,
      membersOnly: parsedMembersOnly,
      type: type || 'Exclusive',
      active: active === 'true' || active === true || active === undefined || active === '',
      category: categoryArray,
      tags: tagsArray,
      image,
      banner,
      rating: parsedRating,
      viewCount: 0
    });

    const savedSeries = await series.save();
    res.status(201).json({
      success: true,
      message: 'Series created successfully',
      data: savedSeries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating series',
      error: error.message
    });
  }
};

// @desc    Get all series with pagination, search, and category filter
// @route   GET /api/series
// @access  Public
exports.getAllSeries = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';

    // Build query - start with empty query to get all data
    // Only filter out explicitly inactive series (active: false)
    let query = {};
    
    // Only add active filter if we want to exclude inactive ones
    // For now, get all data and let frontend filter if needed
    // query.active = { $ne: false };

    // Search filter (searches only in title with prefix matching - case insensitive)
    // Example: "how" will match "How to Handle Ex's Wild Uncle"
    if (search) {
      // Use ^ anchor for prefix matching (starts with)
      const searchRegex = new RegExp('^' + search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.title = { $regex: searchRegex };
    }

    // Category filter - support single category or array of categories
    if (category) {
      let categoryArray = [];
      try {
        // Try to parse as JSON array
        categoryArray = JSON.parse(category);
      } catch (e) {
        // If not JSON, treat as comma-separated string or single value
        if (category.includes(',')) {
          categoryArray = category.split(',').map(c => c.trim());
        } else {
          categoryArray = [category.trim()];
        }
      }
      
      // Filter by categories - series must have at least one matching category
      if (Array.isArray(categoryArray) && categoryArray.length > 0) {
        query.category = { $in: categoryArray };
      }
    }

    // Debug: Log query to see what we're searching for
    console.log('[Series] Query:', JSON.stringify(query, null, 2));
    
    // Get total count for pagination
    const total = await Series.countDocuments(query);
    console.log(`[Series] Total count with query: ${total}`);
    
    // Check total documents in collection
    const allCount = await Series.countDocuments({});
    console.log(`[Series] Total documents in collection: ${allCount}`);

    // Get series with pagination
    let series = await Series.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    console.log(`[Series] Found ${series.length} series (page ${page}, limit ${limit})`);
    
    // If no results but data exists, warn
    if (series.length === 0 && allCount > 0) {
      console.log('[Series] WARNING: Data exists but query returned 0 results. Check query filters.');
    }

    // If user is logged in (via token) or userId passed in query, get saved ids
    let savedIds = [];
    // Priority: req.user.id (from token) > req.query.userId (from query param)
    const userId = req.user?.id || req.query.userId;
    
    if (userId) {
      // Skip static users (they have string IDs like 'static_user_001')
      // Only query if userId is a valid ObjectId (not a static user)
      // MongoDB/Mongoose will handle type conversion automatically
      if (mongoose.Types.ObjectId.isValid(userId) && userId !== 'static_user_001' && userId.toString() !== 'static_user_001') {
        try {
          const saved = await UserSavedSeries.find({ userId: userId }, 'seriesId');
          // Convert seriesIds to strings for comparison, handling both ObjectId and string types
          savedIds = saved.map(s => {
            if (!s.seriesId) return null;
            const id = s.seriesId;
            return id.toString ? id.toString() : String(id);
          }).filter(Boolean);
        } catch (error) {
          console.error('Error fetching saved series:', error);
        }
      }
    }

    // Fix URLs to use current request host and mark isSaved
    series = series.map(s => {
      const seriesObj = s.toObject();
      if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
      if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
      // Convert series _id to string for comparison
      const seriesIdStr = seriesObj._id ? (seriesObj._id.toString ? seriesObj._id.toString() : String(seriesObj._id)) : null;
      seriesObj.isSaved = seriesIdStr ? savedIds.includes(seriesIdStr) : false;
      return seriesObj;
    });

    res.status(200).json({
      success: true,
      data: series,
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
      message: 'Error fetching series',
      error: error.message
    });
  }
};

// @desc    Get a single series by ID
// @route   GET /api/series/:id
// @access  Public
exports.getSeriesById = async (req, res) => {
  try {
    const series = await Series.findById(req.params.id);
    
    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    // Fix URLs to use current request host
    const seriesObj = series.toObject();
    if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
    if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);

    // isSaved flag if user is logged in (via token) or userId passed in query
    // Priority: req.user.id (from token) > req.query.userId (from query param)
    const userId = req.user?.id || req.query.userId;
    
    if (userId) {
      // Skip static users (they have string IDs like 'static_user_001')
      // Only query if userId is a valid ObjectId (not a static user)
      // MongoDB/Mongoose will handle type conversion automatically
      if (mongoose.Types.ObjectId.isValid(userId) && userId !== 'static_user_001' && userId.toString() !== 'static_user_001') {
        try {
          const saved = await UserSavedSeries.findOne({ userId: userId, seriesId: series._id });
          seriesObj.isSaved = !!saved;
        } catch (error) {
          console.error('Error fetching saved series:', error);
          seriesObj.isSaved = false;
        }
      } else {
        seriesObj.isSaved = false;
      }
    } else {
      seriesObj.isSaved = false;
    }

    res.status(200).json({
      success: true,
      data: seriesObj
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid series ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error fetching series',
      error: error.message
    });
  }
};

// @desc    Update a series
// @route   PUT /api/series/:id
// @access  Private
exports.updateSeries = async (req, res) => {
  try {
    const { title, description, totalEpisode, freeEpisode, free, membersOnly, category, type, active, rating } = req.body;

    // Parse category if it's a string (from form-data)
    let categoryArray = category;
    if (category && typeof category === 'string') {
      try {
        categoryArray = JSON.parse(category);
      } catch (e) {
        categoryArray = category.split(',').map(c => c.trim());
      }
    }

    // Get file paths from uploaded files
    const imageFile = req.files && req.files['image'] ? req.files['image'][0] : null;
    const bannerFile = req.files && req.files['banner'] ? req.files['banner'][0] : null;

    // Validation
    if (categoryArray && (!Array.isArray(categoryArray) || categoryArray.length === 0)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Category must be a non-empty array' 
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (totalEpisode !== undefined) updateData.totalEpisode = parseInt(totalEpisode);
    if (freeEpisode !== undefined) updateData.freeEpisode = parseInt(freeEpisode);
    if (free !== undefined) updateData.free = free === 'true' || free === true;
    if (membersOnly !== undefined) updateData.membersOnly = membersOnly === 'true' || membersOnly === true;
    if (type !== undefined) updateData.type = type;
    if (active !== undefined) updateData.active = active === 'true' || active === true;
    if (categoryArray !== undefined) updateData.category = categoryArray;
    
    // Handle rating update
    if (rating !== undefined && rating !== null && rating !== '') {
      const parsedRating = parseFloat(rating);
      if (!isNaN(parsedRating) && parsedRating >= 1 && parsedRating <= 10) {
        updateData.rating = parsedRating;
      } else if (!isNaN(parsedRating)) {
        return res.status(400).json({ 
          success: false, 
          message: 'rating must be a number between 1 and 10' 
        });
      }
    }
    
    // Update image/banner if files are uploaded
    if (imageFile) updateData.image = getFileUrl(req, imageFile);
    else if (req.body.image !== undefined) updateData.image = req.body.image;
    
    if (bannerFile) updateData.banner = getFileUrl(req, bannerFile);
    else if (req.body.banner !== undefined) updateData.banner = req.body.banner;

    const series = await Series.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Series updated successfully',
      data: series
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid series ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating series',
      error: error.message
    });
  }
};

// @desc    Get trending series (new releases with high views, top 10)
// @route   GET /api/series/trending
// @access  Public
exports.getTrendingSeries = async (req, res) => {
  try {
    const maxLimit = 10; // Maximum 10 trending series
    
    // Get latest 50 series (by createdAt) to calculate trending from recent releases
    let series = await Series.find({ active: { $ne: false } })
      .sort({ createdAt: -1 })
      .limit(50); // Get more recent series to find trending ones
    
    // Calculate trending score for each series
    // Trending = new release + high views
    const now = new Date();
    series = series.map(s => {
      const seriesObj = s.toObject();
      
      // Calculate days since release
      const daysSinceRelease = (now - new Date(seriesObj.createdAt)) / (1000 * 60 * 60 * 24);
      const viewCount = seriesObj.viewCount || 0;
      
      // Recency bonus: More recent = higher bonus
      // Last 7 days: High priority (new releases)
      // Last 30 days: Medium priority
      let recencyBonus = 0;
      if (daysSinceRelease <= 7) {
        // Recent releases (last 7 days) get high bonus
        recencyBonus = (7 - daysSinceRelease) * 50; // Max 350 bonus for today's release
      } else if (daysSinceRelease <= 30) {
        // Last 30 days: Medium bonus
        recencyBonus = (30 - daysSinceRelease) * 5; // Decreasing bonus
      }
      
      // Trending score = (viewCount * weight) + recency bonus
      // Priority: New release + high views
      // View count gets 2x weight to prioritize high views
      seriesObj.trendingScore = (viewCount * 2) + recencyBonus;
      
      return seriesObj;
    });
    
    // Sort by trending score (descending) - highest trending first
    // If same score, prefer newer releases (createdAt descending)
    series.sort((a, b) => {
      if (b.trendingScore !== a.trendingScore) {
        return b.trendingScore - a.trendingScore;
      }
      // If same trending score, prefer newer release
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // Take top 10 trending series
    series = series.slice(0, maxLimit);
    
    // Remove trendingScore from response (internal calculation only)
    series = series.map(s => {
      delete s.trendingScore;
      return s;
    });

    // If user is logged in (via token) or userId passed in query, get saved ids
    let savedIds = [];
    // Priority: req.user.id (from token) > req.query.userId (from query param)
    const userId = req.user?.id || req.query.userId;
    
    if (userId) {
      // Skip static users (they have string IDs like 'static_user_001')
      // Only query if userId is a valid ObjectId (not a static user)
      // MongoDB/Mongoose will handle type conversion automatically
      if (mongoose.Types.ObjectId.isValid(userId) && userId !== 'static_user_001' && userId.toString() !== 'static_user_001') {
        try {
          const saved = await UserSavedSeries.find({ userId: userId }, 'seriesId');
          // Convert seriesIds to strings for comparison, handling both ObjectId and string types
          savedIds = saved.map(s => {
            if (!s.seriesId) return null;
            const id = s.seriesId;
            return id.toString ? id.toString() : String(id);
          }).filter(Boolean);
        } catch (error) {
          console.error('Error fetching saved series:', error);
        }
      }
    }

    // Fix URLs to use current request host and mark isSaved
    series = series.map(s => {
      const seriesObj = s;
      if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
      if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
      // Convert series _id to string for comparison
      const seriesIdStr = seriesObj._id ? (seriesObj._id.toString ? seriesObj._id.toString() : String(seriesObj._id)) : null;
      seriesObj.isSaved = seriesIdStr ? savedIds.includes(seriesIdStr) : false;
      return seriesObj;
    });

    res.status(200).json({
      success: true,
      data: series,
      count: series.length,
      message: `Top ${series.length} trending series (new releases with high views)`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching trending series',
      error: error.message
    });
  }
};

// @desc    Get category-wise trending series (latest releases with high views in a category)
// @route   GET /api/series/category/trending?category=xxx
// @access  Public
exports.getCategoryTrendingSeries = async (req, res) => {
  try {
    const category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    // Build query for category
    const query = {
      active: { $ne: false },
      category: { $in: [category] }
    };

    // Get total count for pagination
    const total = await Series.countDocuments(query);

    // Get latest 50 series in this category to calculate trending
    let series = await Series.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    // Calculate trending score for each series
    // Trending = new release + high views
    const now = new Date();
    series = series.map(s => {
      const seriesObj = s.toObject();
      
      // Calculate days since release
      const daysSinceRelease = (now - new Date(seriesObj.createdAt)) / (1000 * 60 * 60 * 24);
      const viewCount = seriesObj.viewCount || 0;
      
      // Recency bonus: More recent = higher bonus
      let recencyBonus = 0;
      if (daysSinceRelease <= 7) {
        recencyBonus = (7 - daysSinceRelease) * 50; // Max 350 bonus
      } else if (daysSinceRelease <= 30) {
        recencyBonus = (30 - daysSinceRelease) * 5;
      }
      
      // Trending score = (viewCount * weight) + recency bonus
      seriesObj.trendingScore = (viewCount * 2) + recencyBonus;
      
      return seriesObj;
    });
    
    // Sort by trending score (descending) - highest trending first
    series.sort((a, b) => {
      if (b.trendingScore !== a.trendingScore) {
        return b.trendingScore - a.trendingScore;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    // Apply pagination
    const paginatedSeries = series.slice(skip, skip + limit);
    
    // Remove trendingScore from response
    const finalSeries = paginatedSeries.map(s => {
      delete s.trendingScore;
      return s;
    });

    // If user is logged in (via token) or userId passed in query, get saved ids
    let savedIds = [];
    const userId = req.user?.id || req.query.userId;
    
    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId) && userId !== 'static_user_001' && userId.toString() !== 'static_user_001') {
        try {
          const saved = await UserSavedSeries.find({ userId: userId }, 'seriesId');
          savedIds = saved.map(s => {
            if (!s.seriesId) return null;
            const id = s.seriesId;
            return id.toString ? id.toString() : String(id);
          }).filter(Boolean);
        } catch (error) {
          console.error('Error fetching saved series:', error);
        }
      }
    }

    // Fix URLs to use current request host and mark isSaved
    const seriesWithSaved = finalSeries.map(s => {
      const seriesObj = s;
      if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
      if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
      const seriesIdStr = seriesObj._id ? (seriesObj._id.toString ? seriesObj._id.toString() : String(seriesObj._id)) : null;
      seriesObj.isSaved = seriesIdStr ? savedIds.includes(seriesIdStr) : false;
      return seriesObj;
    });

    res.status(200).json({
      success: true,
      data: seriesWithSaved,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      message: `Trending series in ${category} category`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category trending series',
      error: error.message
    });
  }
};

// @desc    Get category-wise latest series (new releases in a category)
// @route   GET /api/series/category/latest?category=xxx
// @access  Public
exports.getCategoryLatestSeries = async (req, res) => {
  try {
    const category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    // Build query for category
    const query = {
      active: { $ne: false },
      category: { $in: [category] }
    };

    // Get total count for pagination
    const total = await Series.countDocuments(query);

    // Get latest series sorted by createdAt (newest first)
    let series = await Series.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // If user is logged in (via token) or userId passed in query, get saved ids
    let savedIds = [];
    const userId = req.user?.id || req.query.userId;
    
    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId) && userId !== 'static_user_001' && userId.toString() !== 'static_user_001') {
        try {
          const saved = await UserSavedSeries.find({ userId: userId }, 'seriesId');
          savedIds = saved.map(s => {
            if (!s.seriesId) return null;
            const id = s.seriesId;
            return id.toString ? id.toString() : String(id);
          }).filter(Boolean);
        } catch (error) {
          console.error('Error fetching saved series:', error);
        }
      }
    }

    // Fix URLs to use current request host and mark isSaved
    series = series.map(s => {
      const seriesObj = s.toObject();
      if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
      if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
      const seriesIdStr = seriesObj._id ? (seriesObj._id.toString ? seriesObj._id.toString() : String(seriesObj._id)) : null;
      seriesObj.isSaved = seriesIdStr ? savedIds.includes(seriesIdStr) : false;
      return seriesObj;
    });

    res.status(200).json({
      success: true,
      data: series,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      },
      message: `Latest series in ${category} category`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching category latest series',
      error: error.message
    });
  }
};

// @desc    Get top 10 series by view count
// @route   GET /api/series/top/views
// @access  Public
exports.getTopSeriesByViews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Get top series sorted by viewCount descending
    let series = await Series.find({ active: { $ne: false } })
      .sort({ viewCount: -1 })
      .limit(limit);

    // If user is logged in (via token) or userId passed in query, get saved ids
    let savedIds = [];
    // Priority: req.user.id (from token) > req.query.userId (from query param)
    const userId = req.user?.id || req.query.userId;
    
    if (userId) {
      // Skip static users (they have string IDs like 'static_user_001')
      // Only query if userId is a valid ObjectId (not a static user)
      // MongoDB/Mongoose will handle type conversion automatically
      if (mongoose.Types.ObjectId.isValid(userId) && userId !== 'static_user_001' && userId.toString() !== 'static_user_001') {
        try {
          const saved = await UserSavedSeries.find({ userId: userId }, 'seriesId');
          // Convert seriesIds to strings for comparison, handling both ObjectId and string types
          savedIds = saved.map(s => {
            if (!s.seriesId) return null;
            const id = s.seriesId;
            return id.toString ? id.toString() : String(id);
          }).filter(Boolean);
        } catch (error) {
          console.error('Error fetching saved series:', error);
        }
      }
    }

    // Fix URLs to use current request host and mark isSaved
    series = series.map(s => {
      const seriesObj = s.toObject();
      if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
      if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
      // Convert series _id to string for comparison
      const seriesIdStr = seriesObj._id ? (seriesObj._id.toString ? seriesObj._id.toString() : String(seriesObj._id)) : null;
      seriesObj.isSaved = seriesIdStr ? savedIds.includes(seriesIdStr) : false;
      return seriesObj;
    });

    res.status(200).json({
      success: true,
      data: series,
      count: series.length,
      message: `Top ${series.length} series by view count`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching top series',
      error: error.message
    });
  }
};

// @desc    Delete a series
// @route   DELETE /api/series/:id
// @access  Private
exports.deleteSeries = async (req, res) => {
  try {
    const seriesId = req.params.id;

    // Check if series exists
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    // Delete related data
    const Episode = require('../models/Episode');
    const UserSavedSeries = require('../models/UserSavedSeries');
    const History = require('../models/History');
    const UserEpisode = require('../models/UserEpisode');
    const UserSeriesView = require('../models/UserSeriesView');

    // Delete all episodes related to this series
    await Episode.deleteMany({ seriesId });

    // Delete all saved series entries
    await UserSavedSeries.deleteMany({ seriesId });

    // Delete all history entries
    await History.deleteMany({ seriesId });

    // Delete all user episode unlocks
    await UserEpisode.deleteMany({ seriesId });

    // Delete all user series views
    await UserSeriesView.deleteMany({ seriesId });

    // Finally delete the series itself
    await Series.findByIdAndDelete(seriesId);

    res.status(200).json({
      success: true,
      message: 'Series and all related data deleted successfully',
      data: series
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid series ID'
      });
    }
    console.error('Error deleting series:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting series',
      error: error.message
    });
  }
};

