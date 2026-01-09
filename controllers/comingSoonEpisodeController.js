const mongoose = require('mongoose');
const ComingSoonEpisode = require('../models/ComingSoonEpisode');
const Episode = require('../models/Episode');
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

// @desc    Upload single coming soon episode
// @route   POST /api/coming-soon-episodes
// @access  Private
exports.uploadComingSoonEpisode = async (req, res) => {
  try {
    const { seriesId, comingSoonSeriesId, episode, scheduledReleaseDate } = req.body;

    // Validation
    if (!seriesId && !comingSoonSeriesId) {
      return res.status(400).json({
        success: false,
        message: 'seriesId or comingSoonSeriesId is required'
      });
    }

    if (!episode) {
      return res.status(400).json({
        success: false,
        message: 'episode is required'
      });
    }

    if (!scheduledReleaseDate) {
      return res.status(400).json({
        success: false,
        message: 'scheduledReleaseDate is required (format: YYYY-MM-DDTHH:mm:ss or ISO date string)'
      });
    }

    const parsedEpisode = parseInt(episode);
    if (isNaN(parsedEpisode) || parsedEpisode < 1 || parsedEpisode > 100) {
      return res.status(400).json({
        success: false,
        message: 'episode must be between 1 and 100'
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

    // Check if series exists
    if (seriesId) {
      const series = await Series.findById(seriesId);
      if (!series) {
        return res.status(404).json({
          success: false,
          message: 'Series not found'
        });
      }
    }
    if (!seriesId && comingSoonSeriesId) {
      const ComingSoonSeries = require('../models/ComingSoonSeries');
      const csSeries = await ComingSoonSeries.findById(comingSoonSeriesId);
      if (!csSeries) {
        return res.status(404).json({
          success: false,
          message: 'Coming soon series not found'
        });
      }
    }

    // Check if episode already exists in coming soon
    const existingComingSoon = await ComingSoonEpisode.findOne(
      seriesId
        ? { seriesId, episode: parsedEpisode }
        : { comingSoonSeriesId, episode: parsedEpisode }
    );
    if (existingComingSoon) {
      return res.status(400).json({
        success: false,
        message: `Coming soon episode ${parsedEpisode} already exists for this series`
      });
    }

    // Check if episode already exists in regular episodes
    if (seriesId) {
      const existingEpisode = await Episode.findOne({ seriesId, episode: parsedEpisode });
      if (existingEpisode) {
        return res.status(400).json({
          success: false,
          message: `Episode ${parsedEpisode} already exists in regular episodes for this series`
        });
      }
    }

    // Get video file - required for episode upload
    const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
    
    if (!videoFile) {
      return res.status(400).json({
        success: false,
        message: 'Video file is required'
      });
    }

    const videoUrl = getFileUrl(req, videoFile);

    // Get thumbnail file if provided
    const thumbnailFile = req.files && req.files['videoThumbnail'] 
      ? req.files['videoThumbnail'][0] 
      : (req.files && req.files['videothumbnail'] 
        ? req.files['videothumbnail'][0] 
        : (req.files && req.files['thumbnail'] ? req.files['thumbnail'][0] : null));
    const videoThumbnail = thumbnailFile ? getFileUrl(req, thumbnailFile) : null;

    // Create coming soon episode
    // IMPORTANT: don't store seriesId/comingSoonSeriesId as null, otherwise
    // Mongo's partial indexes on { seriesId: { $exists: true } } will still match.
    const episodeData = {
      episode: parsedEpisode,
      videoUrl,
      videoThumbnail: videoThumbnail,
      scheduledReleaseDate: releaseDate,
      status: 'pending'
    };
    if (seriesId) episodeData.seriesId = seriesId;
    if (comingSoonSeriesId) episodeData.comingSoonSeriesId = comingSoonSeriesId;

    const savedEpisode = new ComingSoonEpisode(episodeData);
    await savedEpisode.save();

    res.status(201).json({
      success: true,
      message: 'Coming soon episode uploaded successfully',
      data: savedEpisode
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Episode number already exists for this series'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading coming soon episode',
      error: error.message
    });
  }
};

// @desc    Get all coming soon episodes for a series
// @route   GET /api/coming-soon-episodes?seriesId=xxx
// @access  Public
exports.getComingSoonEpisodesBySeries = async (req, res) => {
  try {
      const { seriesId, comingSoonSeriesId, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!seriesId && !comingSoonSeriesId) {
      return res.status(400).json({
        success: false,
        message: 'seriesId or comingSoonSeriesId is required as query parameter'
      });
    }

    // Validate series exists
    if (seriesId) {
      const series = await Series.findById(seriesId);
      if (!series) {
        return res.status(404).json({
          success: false,
          message: 'Series not found'
        });
      }
    }
    if (!seriesId && comingSoonSeriesId) {
      const ComingSoonSeries = require('../models/ComingSoonSeries');
      const csSeries = await ComingSoonSeries.findById(comingSoonSeriesId);
      if (!csSeries) {
        return res.status(404).json({
          success: false,
          message: 'Coming soon series not found'
        });
      }
    }

    // Build base query - status filter
    const statusFilter = {
      $or: [
        { status: 'pending' },
        { status: { $exists: false } } // Include documents without status field (old data)
      ]
    };
    
    // Build series filter - STRICT matching by comingSoonSeriesId or seriesId
    let seriesFilter = {};
    if (comingSoonSeriesId) {
      // Convert to ObjectId string for comparison
      const csIdString = String(comingSoonSeriesId).trim();
      if (mongoose.Types.ObjectId.isValid(csIdString)) {
        const csId = new mongoose.Types.ObjectId(csIdString);
        // Only get episodes that have this EXACT comingSoonSeriesId
        seriesFilter.comingSoonSeriesId = csId;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid comingSoonSeriesId format'
        });
      }
    } else if (seriesId) {
      // Convert to ObjectId string for comparison
      const sIdString = String(seriesId).trim();
      if (mongoose.Types.ObjectId.isValid(sIdString)) {
        const sId = new mongoose.Types.ObjectId(sIdString);
        seriesFilter.seriesId = sId;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid seriesId format'
        });
      }
    }
    
    // Build final query - combine all filters using $and
    const queryParts = [statusFilter, seriesFilter];
    
    // Add search filter if provided
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchNum = parseInt(search);
      if (!isNaN(searchNum)) {
        queryParts.push({ $or: [{ title: { $regex: searchRegex } }, { episode: searchNum }] });
      } else {
        queryParts.push({ title: { $regex: searchRegex } });
      }
    }
    
    // Build final query
    const query = queryParts.length > 1 ? { $and: queryParts } : queryParts[0];

    // Debug logging
    console.log('[Coming Soon Episodes] Query params:', {
      comingSoonSeriesId,
      seriesId,
      comingSoonSeriesIdType: typeof comingSoonSeriesId
    });
    console.log('[Coming Soon Episodes] Final query:', JSON.stringify(query, null, 2));

    // Get total count for pagination
    const totalCount = await ComingSoonEpisode.countDocuments(query);
    console.log('[Coming Soon Episodes] Total count with query:', totalCount);
    
    // Also check total episodes in collection for this series (without status filter) for debugging
    if (comingSoonSeriesId || seriesId) {
      const seriesFilterOnly = comingSoonSeriesId 
        ? { comingSoonSeriesId: new mongoose.Types.ObjectId(String(comingSoonSeriesId).trim()) }
        : { seriesId: new mongoose.Types.ObjectId(String(seriesId).trim()) };
      const totalWithoutStatus = await ComingSoonEpisode.countDocuments(seriesFilterOnly);
      console.log('[Coming Soon Episodes] Total episodes for series (without status filter):', totalWithoutStatus);
      
      // Also check with string comparison (in case ObjectId conversion is the issue)
      if (comingSoonSeriesId && totalWithoutStatus === 0) {
        const stringQuery = { comingSoonSeriesId: String(comingSoonSeriesId).trim() };
        const totalWithString = await ComingSoonEpisode.countDocuments(stringQuery);
        console.log('[Coming Soon Episodes] Total episodes with string comingSoonSeriesId:', totalWithString);
        
        // Check all episodes in collection to see what comingSoonSeriesId values exist
        const allEpisodes = await ComingSoonEpisode.find({}).limit(10).select('comingSoonSeriesId _id episode');
        console.log('[Coming Soon Episodes] Sample of all episodes in collection:', 
          allEpisodes.map(e => ({ 
            _id: e._id, 
            comingSoonSeriesId: e.comingSoonSeriesId?.toString() || 'null',
            episode: e.episode
          }))
        );
      }
      
      if (totalWithoutStatus > 0 && totalCount === 0) {
        console.log('[Coming Soon Episodes] WARNING: Episodes exist but query returned 0. Checking status values...');
        // Check what status values exist
        const statusCheck = await ComingSoonEpisode.find(seriesFilterOnly).limit(5).select('status _id comingSoonSeriesId');
        console.log('[Coming Soon Episodes] Sample episodes:', statusCheck.map(e => ({ 
          _id: e._id, 
          status: e.status || 'missing',
          comingSoonSeriesId: e.comingSoonSeriesId?.toString() || 'null'
        })));
      }
    }

    // Get episodes for this series with pagination (sorted by scheduled release date)
    let episodes = await ComingSoonEpisode.find(query)
      .sort({ scheduledReleaseDate: 1, episode: 1 })
      .skip(skip)
      .limit(limit);
    
    console.log('[Coming Soon Episodes] Found episodes:', episodes.length);
    if (episodes.length > 0) {
      console.log('[Coming Soon Episodes] First episode comingSoonSeriesId:', episodes[0].comingSoonSeriesId);
      console.log('[Coming Soon Episodes] First episode seriesId:', episodes[0].seriesId);
    }

    // Fix URLs to use current request host
    episodes = episodes.map(ep => {
      const epObj = ep.toObject();
      if (epObj.videoUrl) epObj.videoUrl = fixFileUrl(req, epObj.videoUrl);
      if (epObj.videoThumbnail) epObj.videoThumbnail = fixFileUrl(req, epObj.videoThumbnail);
      return epObj;
    });

    res.status(200).json({
      success: true,
      data: episodes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid seriesId format'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error fetching coming soon episodes',
      error: error.message
    });
  }
};

// @desc    Get all coming soon episodes (all series)
// @route   GET /api/coming-soon-episodes
// @access  Public
exports.getAllComingSoonEpisodes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search } = req.query;

    // Build query
    let query = { status: 'pending' };
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { title: { $regex: searchRegex } },
        { 'seriesId.title': { $regex: searchRegex } }
      ];
    }

    // Get total count
    const totalCount = await ComingSoonEpisode.countDocuments(query);

    // Get episodes with pagination
    let episodes = await ComingSoonEpisode.find(query)
      .populate('seriesId', 'title image')
      .sort({ scheduledReleaseDate: 1, episode: 1 })
      .skip(skip)
      .limit(limit);

    // Fix URLs
    episodes = episodes.map(ep => {
      const epObj = ep.toObject();
      if (epObj.videoUrl) epObj.videoUrl = fixFileUrl(req, epObj.videoUrl);
      if (epObj.videoThumbnail) epObj.videoThumbnail = fixFileUrl(req, epObj.videoThumbnail);
      if (epObj.seriesId && epObj.seriesId.image) {
        epObj.seriesId.image = fixFileUrl(req, epObj.seriesId.image);
      }
      return epObj;
    });

    res.status(200).json({
      success: true,
      data: episodes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching coming soon episodes',
      error: error.message
    });
  }
};

// @desc    Get single coming soon episode by ID
// @route   GET /api/coming-soon-episodes/:id
// @access  Public
exports.getComingSoonEpisodeById = async (req, res) => {
  try {
    const episode = await ComingSoonEpisode.findById(req.params.id)
      .populate('seriesId', 'title image');
    
    if (!episode) {
      return res.status(404).json({
        success: false,
        message: 'Coming soon episode not found'
      });
    }

    // Fix URLs
    const epObj = episode.toObject();
    if (epObj.videoUrl) epObj.videoUrl = fixFileUrl(req, epObj.videoUrl);
    if (epObj.videoThumbnail) epObj.videoThumbnail = fixFileUrl(req, epObj.videoThumbnail);
    if (epObj.seriesId && epObj.seriesId.image) {
      epObj.seriesId.image = fixFileUrl(req, epObj.seriesId.image);
    }

    res.status(200).json({
      success: true,
      data: epObj
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid episode ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error fetching coming soon episode',
      error: error.message
    });
  }
};

// @desc    Update coming soon episode
// @route   PUT /api/coming-soon-episodes/:id
// @access  Private
exports.updateComingSoonEpisode = async (req, res) => {
  try {
    const { episode, scheduledReleaseDate } = req.body;

    const updateData = {};
    if (episode !== undefined) {
      const parsed = parseInt(episode);
      if (parsed >= 1 && parsed <= 100) {
        updateData.episode = parsed;
      } else {
        return res.status(400).json({
          success: false,
          message: 'episode must be between 1 and 100'
        });
      }
    }

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

    // Handle video file update
    const videoFile = req.files && req.files['video'] ? req.files['video'][0] : null;
    if (videoFile) {
      updateData.videoUrl = getFileUrl(req, videoFile);
    } else if (req.body.videoUrl !== undefined) {
      updateData.videoUrl = req.body.videoUrl;
    }

    // Handle thumbnail file update
    const thumbnailFile = req.files && req.files['videoThumbnail'] 
      ? req.files['videoThumbnail'][0] 
      : (req.files && req.files['videothumbnail'] 
        ? req.files['videothumbnail'][0] 
        : (req.files && req.files['thumbnail'] ? req.files['thumbnail'][0] : null));
    if (thumbnailFile) {
      updateData.videoThumbnail = getFileUrl(req, thumbnailFile);
    } else if (req.body.videoThumbnail !== undefined) {
      updateData.videoThumbnail = req.body.videoThumbnail;
    }

    const episodeDoc = await ComingSoonEpisode.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!episodeDoc) {
      return res.status(404).json({
        success: false,
        message: 'Coming soon episode not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coming soon episode updated successfully',
      data: episodeDoc
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid episode ID'
      });
    }
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Episode number already exists for this series'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating coming soon episode',
      error: error.message
    });
  }
};

// @desc    Delete coming soon episode
// @route   DELETE /api/coming-soon-episodes/:id
// @access  Private
exports.deleteComingSoonEpisode = async (req, res) => {
  try {
    const episode = await ComingSoonEpisode.findByIdAndDelete(req.params.id);

    if (!episode) {
      return res.status(404).json({
        success: false,
        message: 'Coming soon episode not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Coming soon episode deleted successfully',
      data: episode
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid episode ID'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error deleting coming soon episode',
      error: error.message
    });
  }
};

// @desc    Batch upload coming soon episodes
// @route   POST /api/coming-soon-episodes/batch
// @access  Private
exports.uploadBatchComingSoonEpisodes = async (req, res) => {
  try {
    const { seriesId, comingSoonSeriesId, scheduledReleaseDate, episodeNumbers } = req.body;

    console.log('[Upload] Received request:', {
      seriesId,
      comingSoonSeriesId,
      scheduledReleaseDate,
      hasVideoFiles: req.files && req.files['video'] ? req.files['video'].length : 0,
      comingSoonSeriesIdType: typeof comingSoonSeriesId
    });

    if (!seriesId && !comingSoonSeriesId) {
      return res.status(400).json({
        success: false,
        message: 'seriesId or comingSoonSeriesId is required'
      });
    }

    if (!scheduledReleaseDate) {
      console.error('[Upload] ❌ scheduledReleaseDate is missing');
      return res.status(400).json({
        success: false,
        message: 'scheduledReleaseDate is required'
      });
    }

    // Parse scheduled release date
    const releaseDate = new Date(scheduledReleaseDate);
    console.log('[Upload] Parsed scheduledReleaseDate:', {
      input: scheduledReleaseDate,
      parsed: releaseDate,
      isValid: !isNaN(releaseDate.getTime()),
      isFuture: releaseDate > new Date()
    });
    
    if (isNaN(releaseDate.getTime())) {
      console.error('[Upload] ❌ Invalid scheduledReleaseDate format:', scheduledReleaseDate);
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduledReleaseDate format'
      });
    }

    if (releaseDate <= new Date()) {
      console.error('[Upload] ❌ scheduledReleaseDate is not in the future:', {
        scheduled: releaseDate,
        now: new Date()
      });
      return res.status(400).json({
        success: false,
        message: 'scheduledReleaseDate must be in the future'
      });
    }

    // Check if series exists
    if (seriesId) {
      const series = await Series.findById(seriesId);
      if (!series) {
        return res.status(404).json({
          success: false,
          message: 'Series not found'
        });
      }
    }
    if (!seriesId && comingSoonSeriesId) {
      const ComingSoonSeries = require('../models/ComingSoonSeries');
      const csSeries = await ComingSoonSeries.findById(comingSoonSeriesId);
      if (!csSeries) {
        return res.status(404).json({
          success: false,
          message: 'Coming soon series not found'
        });
      }
    }

    // Get video files
    const videoFiles = req.files && req.files['video'] ? req.files['video'] : [];
    const thumbnailFiles = req.files && req.files['videoThumbnail'] 
      ? req.files['videoThumbnail'] 
      : (req.files && req.files['videothumbnail'] ? req.files['videothumbnail'] : []);

    console.log('[Upload] File check:', {
      videoFilesCount: videoFiles.length,
      thumbnailFilesCount: thumbnailFiles.length,
      hasFiles: !!req.files,
      fileKeys: req.files ? Object.keys(req.files) : []
    });

    if (videoFiles.length === 0) {
      console.error('[Upload] ❌ No video files found in request');
      return res.status(400).json({
        success: false,
        message: 'At least one video file is required'
      });
    }

    // Parse episode numbers if provided
    let episodeNumbersArray = [];
    if (episodeNumbers) {
      try {
        episodeNumbersArray = typeof episodeNumbers === 'string' 
          ? JSON.parse(episodeNumbers) 
          : episodeNumbers;
      } catch (e) {
        episodeNumbersArray = [];
      }
    }

    // If episode numbers not provided, derive them safely
    if (!Array.isArray(episodeNumbersArray) || episodeNumbersArray.length === 0) {
      episodeNumbersArray = videoFiles.map((file, index) => {
        // Try to extract a small episode number (1–3 digits) from the filename
        // Prefer the last number in the string so names like "S01E05.mp4" → 5
        const matches = file.originalname.match(/(\d{1,3})(?!.*\d)/);
        if (matches) {
          const num = parseInt(matches[1], 10);
          if (!isNaN(num) && num >= 1 && num <= 100) {
            return num;
          }
        }
        // Fallback: simple sequential numbering starting from 1
        return index + 1;
      });
    }

    const uploadedEpisodes = [];
    const errors = [];

    console.log('[Upload] Starting to process', videoFiles.length, 'video file(s)');

    for (let i = 0; i < videoFiles.length; i++) {
      console.log(`[Upload] Processing file ${i + 1}/${videoFiles.length}:`, videoFiles[i]?.originalname || 'unknown');
      try {
        const episodeNumber = parseInt(episodeNumbersArray[i]) || (i + 1);
        
        if (episodeNumber < 1 || episodeNumber > 100) {
          const errorMsg = `Invalid episode number: ${episodeNumber}`;
          console.error(`[Upload] ❌ ${errorMsg} for file: ${videoFiles[i]?.originalname || 'unknown'}`);
          errors.push({
            file: videoFiles[i].originalname,
            error: errorMsg
          });
          continue;
        }

        // Convert to ObjectId for query - STRICT conversion
        let queryForExisting = {};
        if (comingSoonSeriesId) {
          const csIdString = String(comingSoonSeriesId).trim();
          if (mongoose.Types.ObjectId.isValid(csIdString)) {
            const csId = new mongoose.Types.ObjectId(csIdString);
            queryForExisting = { comingSoonSeriesId: csId, episode: episodeNumber };
          } else {
            const errorMsg = 'Invalid comingSoonSeriesId format (query check)';
            console.error(`[Upload] ❌ ${errorMsg} for file: ${videoFiles[i]?.originalname || 'unknown'}`);
            errors.push({
              file: videoFiles[i].originalname,
              error: errorMsg
            });
            continue;
          }
        } else if (seriesId) {
          const sIdString = String(seriesId).trim();
          if (mongoose.Types.ObjectId.isValid(sIdString)) {
            const sId = new mongoose.Types.ObjectId(sIdString);
            queryForExisting = { seriesId: sId, episode: episodeNumber };
          } else {
            const errorMsg = 'Invalid seriesId format (query check)';
            console.error(`[Upload] ❌ ${errorMsg} for file: ${videoFiles[i]?.originalname || 'unknown'}`);
            errors.push({
              file: videoFiles[i].originalname,
              error: errorMsg
            });
            continue;
          }
        }
        
        // Check if already exists
        const existing = await ComingSoonEpisode.findOne(queryForExisting);
        if (existing) {
          const errorMsg = `Episode ${episodeNumber} already exists`;
          console.error(`[Upload] ❌ ${errorMsg} for file: ${videoFiles[i]?.originalname || 'unknown'}`);
          errors.push({
            file: videoFiles[i].originalname,
            episode: episodeNumber,
            error: errorMsg
          });
          continue;
        }

        const videoUrl = getFileUrl(req, videoFiles[i]);
        const videoThumbnail = thumbnailFiles[i] ? getFileUrl(req, thumbnailFiles[i]) : null;

        // Convert to ObjectId if provided - STRICT conversion
        let finalSeriesId = null;
        let finalComingSoonSeriesId = null;
        
        if (comingSoonSeriesId) {
          const csIdString = String(comingSoonSeriesId).trim();
          if (mongoose.Types.ObjectId.isValid(csIdString)) {
            finalComingSoonSeriesId = new mongoose.Types.ObjectId(csIdString);
          } else {
            const errorMsg = 'Invalid comingSoonSeriesId format';
            console.error(`[Upload] ❌ ${errorMsg} for file: ${videoFiles[i]?.originalname || 'unknown'}`);
            errors.push({
              file: videoFiles[i].originalname,
              error: errorMsg
            });
            continue;
          }
        } else if (seriesId) {
          const sIdString = String(seriesId).trim();
          if (mongoose.Types.ObjectId.isValid(sIdString)) {
            finalSeriesId = new mongoose.Types.ObjectId(sIdString);
          } else {
            const errorMsg = 'Invalid seriesId format';
            console.error(`[Upload] ❌ ${errorMsg} for file: ${videoFiles[i]?.originalname || 'unknown'}`);
            errors.push({
              file: videoFiles[i].originalname,
              error: errorMsg
            });
            continue;
          }
        }

        // Build episode data without null seriesId/comingSoonSeriesId
        const episodePayload = {
          episode: episodeNumber,
          videoUrl,
          videoThumbnail,
          scheduledReleaseDate: releaseDate,
          status: 'pending'
        };
        if (finalSeriesId) episodePayload.seriesId = finalSeriesId;
        if (finalComingSoonSeriesId) episodePayload.comingSoonSeriesId = finalComingSoonSeriesId;

        const episode = new ComingSoonEpisode(episodePayload);
        
        console.log('[Upload] Saving episode with:', {
          seriesId: finalSeriesId,
          comingSoonSeriesId: finalComingSoonSeriesId,
          episode: episodeNumber,
          comingSoonSeriesIdString: comingSoonSeriesId,
          comingSoonSeriesIdType: typeof comingSoonSeriesId
        });

        const savedEpisode = await episode.save();
        console.log('[Upload] Saved episode:', {
          _id: savedEpisode._id,
          comingSoonSeriesId: savedEpisode.comingSoonSeriesId,
          comingSoonSeriesIdString: savedEpisode.comingSoonSeriesId?.toString(),
          seriesId: savedEpisode.seriesId,
          seriesIdString: savedEpisode.seriesId?.toString(),
          episode: savedEpisode.episode,
          status: savedEpisode.status,
          scheduledReleaseDate: savedEpisode.scheduledReleaseDate
        });
        uploadedEpisodes.push(savedEpisode);
        
        // Verify episode was saved by querying it back with the exact comingSoonSeriesId
        if (finalComingSoonSeriesId) {
          const verifyQuery = { 
            _id: savedEpisode._id,
            comingSoonSeriesId: finalComingSoonSeriesId 
          };
          const verifyEpisode = await ComingSoonEpisode.findOne(verifyQuery);
          if (verifyEpisode) {
            console.log('[Upload] ✅ Verified episode exists in DB with correct comingSoonSeriesId:', {
              _id: verifyEpisode._id,
              comingSoonSeriesId: verifyEpisode.comingSoonSeriesId?.toString()
            });
          } else {
            console.error('[Upload] ❌ WARNING: Episode not found with comingSoonSeriesId query!', {
              _id: savedEpisode._id,
              queryComingSoonSeriesId: finalComingSoonSeriesId.toString()
            });
            // Try to find it by _id only
            const byIdOnly = await ComingSoonEpisode.findById(savedEpisode._id);
            if (byIdOnly) {
              console.log('[Upload] Found by _id only, but comingSoonSeriesId mismatch:', {
                saved: byIdOnly.comingSoonSeriesId?.toString(),
                expected: finalComingSoonSeriesId.toString()
              });
            }
          }
        }
      } catch (error) {
        console.error(`[Upload] ❌ Error processing file ${i + 1} (${videoFiles[i]?.originalname || 'unknown'}):`, {
          error: error.message,
          stack: error.stack,
          name: error.name
        });
        errors.push({
          file: videoFiles[i]?.originalname || 'unknown',
          error: error.message
        });
      }
    }

    console.log('[Upload] Processing complete:', {
      total: videoFiles.length,
      successful: uploadedEpisodes.length,
      failed: errors.length
    });

    // After upload, verify episodes exist in database
    if (uploadedEpisodes.length > 0 && comingSoonSeriesId) {
      const verifyCsId = new mongoose.Types.ObjectId(String(comingSoonSeriesId).trim());
      const verifyCount = await ComingSoonEpisode.countDocuments({ 
        comingSoonSeriesId: verifyCsId 
      });
      console.log('[Upload] Verification after upload:', {
        uploadedCount: uploadedEpisodes.length,
        foundInDB: verifyCount,
        comingSoonSeriesId: verifyCsId.toString()
      });
      
      if (verifyCount === 0 && uploadedEpisodes.length > 0) {
        console.error('[Upload] ❌ CRITICAL: Episodes were saved but not found in database!');
        // Try to find by _id
        for (const ep of uploadedEpisodes) {
          const byId = await ComingSoonEpisode.findById(ep._id);
          if (byId) {
            console.log('[Upload] Found episode by _id:', {
              _id: byId._id,
              comingSoonSeriesId: byId.comingSoonSeriesId?.toString(),
              expected: verifyCsId.toString()
            });
          } else {
            console.error('[Upload] Episode not found even by _id:', ep._id);
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${uploadedEpisodes.length} coming soon episode(s)`,
      data: {
        uploaded: uploadedEpisodes,
        errors: errors.length > 0 ? errors : undefined
      },
      stats: {
        total: videoFiles.length,
        successful: uploadedEpisodes.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('[Upload] ❌ CRITICAL ERROR in uploadBatchComingSoonEpisodes:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Error uploading coming soon episodes',
      error: error.message
    });
  }
};

