const ComingSoonSeries = require('../models/ComingSoonSeries');
const Series = require('../models/Series');
const path = require('path');

// Helper to compute a stable base URL for serving files
const getBaseUrl = (req) => {
  if (process.env.FILE_BASE_URL) return process.env.FILE_BASE_URL;
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (req) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
    return `${protocol}://${host}`;
  }
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

// @desc    Create a new coming soon series
// @route   POST /api/coming-soon-series
// @access  Private
exports.createComingSoonSeries = async (req, res) => {
  try {
    const cleanValue = (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'string') {
        let cleaned = value.trim();
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
          cleaned = cleaned.slice(1, -1);
        }
        return cleaned || undefined;
      }
      return value;
    };

    let { title, description, totalEpisode, freeEpisode, free, membersOnly, category, type, active, tags, rating, scheduledReleaseDate } = req.body;
    
    // Validation
    if (!scheduledReleaseDate) {
      return res.status(400).json({
        success: false,
        message: 'scheduledReleaseDate is required (format: YYYY-MM-DDTHH:mm:ss)'
      });
    }

    // Parse scheduled release date
    const releaseDate = new Date(scheduledReleaseDate);
    if (isNaN(releaseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduledReleaseDate format. Use ISO date string (e.g., 2024-12-25T10:30:00)'
      });
    }

    // Check if release date is in the future
    if (releaseDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'scheduledReleaseDate must be in the future'
      });
    }

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
    if (free === undefined || free === null || free === '') missingFields.push('free');
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
    const parsedMembersOnly = membersOnly === 'true' || membersOnly === true || membersOnly === 'True' || false;

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

    const comingSoonSeries = new ComingSoonSeries({
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
      viewCount: 0,
      scheduledReleaseDate: releaseDate,
      status: 'pending'
    });

    const savedSeries = await comingSoonSeries.save();
    res.status(201).json({
      success: true,
      message: 'Coming soon series created successfully',
      data: savedSeries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating coming soon series',
      error: error.message
    });
  }
};

// @desc    Get all coming soon series
// @route   GET /api/coming-soon-series
// @access  Public
exports.getAllComingSoonSeries = async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || '';

    // Build base query - get all coming soon series
    // Only filter by status if it exists, otherwise get all
    const baseQuery = {
      $or: [
        { status: 'pending' },
        { status: { $exists: false } } // Include documents without status field (old data)
      ]
    };

    // Build query with all filters
    let query = { ...baseQuery };

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchOr = [
        { title: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
        { category: { $regex: searchRegex } }
      ];
      
      // Combine base query with search using $and
      query = {
        $and: [
          baseQuery,
          { $or: searchOr }
        ]
      };
    }

    // Category filter
    if (category) {
      let categoryArray = [];
      try {
        categoryArray = JSON.parse(category);
      } catch (e) {
        if (category.includes(',')) {
          categoryArray = category.split(',').map(c => c.trim());
        } else {
          categoryArray = [category.trim()];
        }
      }
      
      if (Array.isArray(categoryArray) && categoryArray.length > 0) {
        if (search) {
          // Add category to existing $and
          query.$and.push({ category: { $in: categoryArray } });
        } else {
          // Add category to base query
          if (query.$and) {
            query.$and.push({ category: { $in: categoryArray } });
          } else {
            query.category = { $in: categoryArray };
          }
        }
      }
    }

    // Debug: Log query to see what we're searching for
    console.log('[Coming Soon Series] Query:', JSON.stringify(query, null, 2));
    
    // Get total count first
    const totalCount = await ComingSoonSeries.countDocuments(query);
    console.log(`[Coming Soon Series] Total count in DB: ${totalCount}`);
    
    // Get series
    let series = await ComingSoonSeries.find(query)
      .sort({ scheduledReleaseDate: 1, createdAt: -1 });
    
    console.log(`[Coming Soon Series] Found ${series.length} series after query`);
    
    // If no results, try without any filters to see if data exists
    if (series.length === 0) {
      const allCount = await ComingSoonSeries.countDocuments({});
      console.log(`[Coming Soon Series] Total documents in collection: ${allCount}`);
      if (allCount > 0) {
        console.log('[Coming Soon Series] WARNING: Data exists but query returned 0 results. Check query filters.');
      }
    }

    // Helper function to format date and time separately (12-hour format with AM/PM)
    const formatDateAndTime = (dateValue) => {
      if (!dateValue) return { date: null, time: null };
      const date = new Date(dateValue);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Convert to 12-hour format with AM/PM
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const formattedHours = String(hours).padStart(2, '0');
      
      return {
        date: `${year}-${month}-${day}`,
        time: `${formattedHours}:${minutes} ${ampm}`
      };
    };

    // Fix URLs to use current request host
    // Format dates to show separate date and time fields
    series = series.map(s => {
      const seriesObj = s.toObject();
      if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
      if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
      
      // Format scheduledReleaseDate - separate date and time
      if (seriesObj.scheduledReleaseDate) {
        const scheduled = formatDateAndTime(seriesObj.scheduledReleaseDate);
        seriesObj.scheduledReleaseDate = {
          date: scheduled.date,
          time: scheduled.time
        };
      }
      
      // Format createdAt - separate date and time
      if (seriesObj.createdAt) {
        const created = formatDateAndTime(seriesObj.createdAt);
        seriesObj.createdAt = {
          date: created.date,
          time: created.time
        };
      }
      
      // Format updatedAt - separate date and time
      if (seriesObj.updatedAt) {
        const updated = formatDateAndTime(seriesObj.updatedAt);
        seriesObj.updatedAt = {
          date: updated.date,
          time: updated.time
        };
      }
      
      return seriesObj;
    });

    res.status(200).json({
      success: true,
      data: series
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching coming soon series',
      error: error.message
    });
  }
};

// @desc    Get single coming soon series by ID
// @route   GET /api/coming-soon-series/:id
// @access  Public
exports.getComingSoonSeriesById = async (req, res) => {
  try {
    const series = await ComingSoonSeries.findById(req.params.id);
    
    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Coming soon series not found'
      });
    }

    // Helper function to format date and time separately (12-hour format with AM/PM)
    const formatDateAndTime = (dateValue) => {
      if (!dateValue) return { date: null, time: null };
      const date = new Date(dateValue);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Convert to 12-hour format with AM/PM
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const formattedHours = String(hours).padStart(2, '0');
      
      return {
        date: `${year}-${month}-${day}`,
        time: `${formattedHours}:${minutes} ${ampm}`
      };
    };

    // Fix URLs to use current request host
    const seriesObj = series.toObject();
    if (seriesObj.image) seriesObj.image = fixFileUrl(req, seriesObj.image);
    if (seriesObj.banner) seriesObj.banner = fixFileUrl(req, seriesObj.banner);
    
    // Format scheduledReleaseDate - separate date and time
    if (seriesObj.scheduledReleaseDate) {
      const scheduled = formatDateAndTime(seriesObj.scheduledReleaseDate);
      seriesObj.scheduledReleaseDate = {
        date: scheduled.date,
        time: scheduled.time
      };
    }
    
    // Format createdAt - separate date and time
    if (seriesObj.createdAt) {
      const created = formatDateAndTime(seriesObj.createdAt);
      seriesObj.createdAt = {
        date: created.date,
        time: created.time
      };
    }
    
    // Format updatedAt - separate date and time
    if (seriesObj.updatedAt) {
      const updated = formatDateAndTime(seriesObj.updatedAt);
      seriesObj.updatedAt = {
        date: updated.date,
        time: updated.time
      };
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
      message: 'Error fetching coming soon series',
      error: error.message
    });
  }
};

// @desc    Update coming soon series
// @route   PUT /api/coming-soon-series/:id
// @access  Private
exports.updateComingSoonSeries = async (req, res) => {
  try {
    const { title, description, totalEpisode, freeEpisode, free, membersOnly, category, type, active, rating, scheduledReleaseDate } = req.body;

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
      } else {
        return res.status(400).json({
          success: false,
          message: 'rating must be a number between 1 and 10'
        });
      }
    }

    // Handle scheduled release date update
    if (scheduledReleaseDate !== undefined) {
      const releaseDate = new Date(scheduledReleaseDate);
      if (isNaN(releaseDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduledReleaseDate format'
        });
      }
      if (releaseDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'scheduledReleaseDate must be in the future'
        });
      }
      updateData.scheduledReleaseDate = releaseDate;
    }
    
    // Update image/banner if files are uploaded
    if (imageFile) updateData.image = getFileUrl(req, imageFile);
    else if (req.body.image !== undefined) updateData.image = req.body.image;
    
    if (bannerFile) updateData.banner = getFileUrl(req, bannerFile);
    else if (req.body.banner !== undefined) updateData.banner = req.body.banner;

    const series = await ComingSoonSeries.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Coming soon series not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coming soon series updated successfully',
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
      message: 'Error updating coming soon series',
      error: error.message
    });
  }
};

// @desc    Delete coming soon series
// @route   DELETE /api/coming-soon-series/:id
// @access  Private
exports.deleteComingSoonSeries = async (req, res) => {
  try {
    const series = await ComingSoonSeries.findByIdAndDelete(req.params.id);

    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Coming soon series not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coming soon series deleted successfully',
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
      message: 'Error deleting coming soon series',
      error: error.message
    });
  }
};

