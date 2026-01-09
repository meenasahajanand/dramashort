const Episode = require('../models/Episode');
const Series = require('../models/Series');
const UserSeriesView = require('../models/UserSeriesView');
const path = require('path');

// Helper to compute a stable base URL for serving files
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

// @desc    Upload single episode
// @route   POST /api/episodes
// @access  Private
exports.uploadEpisode = async (req, res) => {
  try {
    const { seriesId, episode } = req.body;

    // Validation
    if (!seriesId) {
      return res.status(400).json({
        success: false,
        message: 'seriesId is required'
      });
    }

    if (!episode) {
      return res.status(400).json({
        success: false,
        message: 'episode is required'
      });
    }

    const parsedEpisode = parseInt(episode);
    if (isNaN(parsedEpisode) || parsedEpisode < 1 || parsedEpisode > 100) {
      return res.status(400).json({
        success: false,
        message: 'episode must be between 1 and 100'
      });
    }

    // Check if series exists
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    // Check if episode already exists
    const existingEpisode = await Episode.findOne({ seriesId, episode: parsedEpisode });
    if (existingEpisode) {
      return res.status(400).json({
        success: false,
        message: `Episode ${parsedEpisode} already exists for this series`
      });
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

    // Create episode with seriesId, episode, videoUrl, and videoThumbnail
    const episodeData = {
      seriesId,
      episode: parsedEpisode,
      videoUrl,
      videoThumbnail: videoThumbnail
    };

    const savedEpisode = new Episode(episodeData);
    await savedEpisode.save();

    res.status(201).json({
      success: true,
      message: 'Episode uploaded successfully',
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
      message: 'Error uploading episode',
      error: error.message
    });
  }
};

// Helper function to extract episode number from filename
const extractEpisodeNumber = (filename) => {
  // Try to extract episode number from filename patterns like:
  // ep1.mp4, episode1.mp4, ep_1.mp4, episode_1.mp4, 1.mp4, etc.
  // IMPORTANT: Only extract 1-3 digit numbers (episodes are 1-100)
  const patterns = [
    /ep[_\s]*(\d{1,3})/i,           // ep1, ep_1, ep 1 (max 3 digits)
    /episode[_\s]*(\d{1,3})/i,       // episode1, episode_1, episode 1 (max 3 digits)
    /^(\d{1,3})[._\s-]/,             // 1.mp4, 1_episode.mp4 (max 3 digits)
    /[._\s-](\d{1,3})[._\s-]/,       // video_1.mp4, video-1-episode.mp4 (max 3 digits)
    /^(\d{1,3})$/                     // Just a number (max 3 digits)
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      const num = parseInt(match[1]);
      // Only return if it's a valid episode number (1-100)
      if (num >= 1 && num <= 100) {
        return num;
      }
    }
  }
  return null;
};

// @desc    Upload multiple episodes (batch upload)
// @route   POST /api/episodes/batch
// @access  Private
exports.uploadBatchEpisodes = async (req, res) => {
  try {
    const { seriesId, episodeNumbers } = req.body;

    console.log('[Upload Episodes] Received request:', {
      seriesId,
      hasVideoFiles: req.files && req.files['video'] ? req.files['video'].length : 0,
      hasEpisodeFiles: req.files && req.files['episodes'] ? req.files['episodes'].length : 0
    });

    if (!seriesId) {
      return res.status(400).json({
        success: false,
        message: 'seriesId is required'
      });
    }

    // Check if series exists
    const series = await Series.findById(seriesId);
    if (!series) {
      console.error('[Upload Episodes] ❌ Series not found:', seriesId);
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }
    console.log('[Upload Episodes] ✅ Series found:', series.title);

    // Get video files from 'video' field (primary) or backward compatibility fields
    const videoFiles = req.files && req.files['video'] ? req.files['video'] : [];
    const episodeFiles = req.files && req.files['episodes'] ? req.files['episodes'] : [];
    const allVideoFiles = videoFiles.length > 0 ? videoFiles : episodeFiles;

    // Get thumbnail files from 'videoThumbnail' field (primary) or backward compatibility fields
    const videoThumbnailFiles = (req.files && req.files['videoThumbnail']) 
      ? req.files['videoThumbnail'] 
      : (req.files && req.files['videothumbnail'])
        ? req.files['videothumbnail']
        : (req.files && req.files['thumbnail'])
          ? req.files['thumbnail']
          : [];

    console.log('[Upload Episodes] File check:', {
      videoFilesCount: allVideoFiles.length,
      thumbnailFilesCount: videoThumbnailFiles.length,
      hasFiles: !!req.files,
      fileKeys: req.files ? Object.keys(req.files) : []
    });

    if (allVideoFiles.length === 0) {
      console.error('[Upload Episodes] ❌ No video files found in request');
      return res.status(400).json({
        success: false,
        message: 'At least one video file is required in video field'
      });
    }

    if (allVideoFiles.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 videos allowed'
      });
    }

    // Validate thumbnail count matches video count
    if (videoThumbnailFiles.length > 0 && videoThumbnailFiles.length !== allVideoFiles.length) {
      return res.status(400).json({
        success: false,
        message: `Number of thumbnails (${videoThumbnailFiles.length}) must match number of videos (${allVideoFiles.length}). If you have ${allVideoFiles.length} videos, you need ${allVideoFiles.length} thumbnails.`
      });
    }

    // Parse episode numbers if provided, otherwise extract from filenames
    let episodeNumbersArray = [];
    if (episodeNumbers) {
      try {
        episodeNumbersArray = typeof episodeNumbers === 'string' 
          ? JSON.parse(episodeNumbers) 
          : episodeNumbers;
      } catch (e) {
        // If parsing fails, try to extract from filenames
        episodeNumbersArray = [];
      }
    }

    // If episode numbers not provided, extract from filenames
    if (!Array.isArray(episodeNumbersArray) || episodeNumbersArray.length === 0) {
      episodeNumbersArray = allVideoFiles.map((file, index) => {
        const extracted = extractEpisodeNumber(file.originalname);
        // Only use extracted if it's valid (1-100), otherwise use sequential
        return extracted !== null && extracted >= 1 && extracted <= 100 ? extracted : (index + 1);
      });
    }

    // Validate episode numbers array length matches video files
    if (episodeNumbersArray.length !== allVideoFiles.length) {
      // If mismatch, use sequential numbers starting from 1
      episodeNumbersArray = allVideoFiles.map((file, index) => {
        const extracted = extractEpisodeNumber(file.originalname);
        // Only use extracted if it's valid (1-100), otherwise use sequential
        return extracted !== null && extracted >= 1 && extracted <= 100 ? extracted : (index + 1);
      });
    }

    const uploadedEpisodes = [];
    const errors = [];

    console.log('[Upload Episodes] Starting to process', allVideoFiles.length, 'video file(s)');

    // Process each episode
    for (let i = 0; i < allVideoFiles.length; i++) {
      try {
        console.log(`[Upload Episodes] Processing file ${i + 1}/${allVideoFiles.length}:`, allVideoFiles[i]?.originalname || 'unknown');
        let episodeNumber = episodeNumbersArray[i];
        
        // If episode number not provided in array, extract from filename
        if (!episodeNumber || isNaN(episodeNumber)) {
          episodeNumber = extractEpisodeNumber(allVideoFiles[i].originalname);
          if (!episodeNumber || episodeNumber < 1 || episodeNumber > 100) {
            episodeNumber = i + 1; // Default to sequential
          }
        }

        episodeNumber = parseInt(episodeNumber);

        if (isNaN(episodeNumber) || episodeNumber < 1 || episodeNumber > 100) {
          const errorMsg = `Invalid episode number: ${episodeNumber} (must be 1-100)`;
          console.error(`[Upload Episodes] ❌ ${errorMsg} for file: ${allVideoFiles[i]?.originalname || 'unknown'}`);
          errors.push({
            file: allVideoFiles[i].originalname,
            error: errorMsg
          });
          continue;
        }

        // Check if episode already exists
        const existingEpisode = await Episode.findOne({ 
          seriesId, 
          episode: episodeNumber 
        });

        if (existingEpisode) {
          const errorMsg = `Episode ${episodeNumber} already exists`;
          console.error(`[Upload Episodes] ❌ ${errorMsg} for file: ${allVideoFiles[i]?.originalname || 'unknown'}`);
          errors.push({
            file: allVideoFiles[i].originalname,
            episode: episodeNumber,
            error: errorMsg
          });
          continue;
        }

        // Get video file
        const videoFile = allVideoFiles[i];
        const videoUrl = getFileUrl(req, videoFile);

        // Get corresponding thumbnail for this episode (sequence: 1st video → 1st thumbnail, 2nd video → 2nd thumbnail, etc.)
        // If 100 videos, then 100 thumbnails should be provided
        let videoThumbnail = null;
        if (videoThumbnailFiles.length > 0) {
          // Use same index for thumbnail (1st video → 1st thumbnail)
          if (i < videoThumbnailFiles.length) {
            const thumbnailFile = videoThumbnailFiles[i];
            videoThumbnail = getFileUrl(req, thumbnailFile);
          } else {
            // If thumbnail not available for this index, use first thumbnail as fallback
            const thumbnailFile = videoThumbnailFiles[0];
            videoThumbnail = getFileUrl(req, thumbnailFile);
          }
        }

        // Create episode with seriesId, episode, videoUrl, and videoThumbnail
        const episode = new Episode({
          seriesId,
          episode: episodeNumber,
          videoUrl,
          videoThumbnail: videoThumbnail
        });

        console.log('[Upload Episodes] Saving episode with:', {
          seriesId,
          episode: episodeNumber,
          videoUrl: videoUrl ? 'present' : 'missing',
          videoThumbnail: videoThumbnail ? 'present' : 'missing'
        });

        const savedEpisode = await episode.save();
        console.log('[Upload Episodes] ✅ Saved episode:', {
          _id: savedEpisode._id,
          seriesId: savedEpisode.seriesId,
          episode: savedEpisode.episode
        });
        uploadedEpisodes.push(savedEpisode);
      } catch (error) {
        console.error(`[Upload Episodes] ❌ Error processing file ${i + 1} (${allVideoFiles[i]?.originalname || 'unknown'}):`, {
          error: error.message,
          stack: error.stack,
          name: error.name
        });
        errors.push({
          file: allVideoFiles[i]?.originalname || 'unknown',
          error: error.message
        });
      }
    }

    console.log('[Upload Episodes] Processing complete:', {
      total: allVideoFiles.length,
      successful: uploadedEpisodes.length,
      failed: errors.length
    });

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${uploadedEpisodes.length} episode(s)`,
      data: {
        uploaded: uploadedEpisodes,
        errors: errors.length > 0 ? errors : undefined
      },
      stats: {
        total: allVideoFiles.length,
        successful: uploadedEpisodes.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('[Upload Episodes] ❌ CRITICAL ERROR in uploadBatchEpisodes:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Error uploading episodes',
      error: error.message
    });
  }
};

// @desc    Get all episodes for a series
// @route   GET /api/episodes?seriesId=xxx&search=xxx
// @access  Public
exports.getEpisodesBySeries = async (req, res) => {
  try {
    const { seriesId, search } = req.query;

    if (!seriesId) {
      return res.status(400).json({
        success: false,
        message: 'seriesId is required as query parameter'
      });
    }

    // Validate series exists
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({
        success: false,
        message: 'Series not found'
      });
    }

    // Track view count if user is authenticated
    // Only increment if this is the first time this user views this series
    if (req.user && req.user.id && req.user.id !== 'static_user_001') {
      try {
        const userId = req.user.id;
        
        // Check if user has already viewed this series
        const existingView = await UserSeriesView.findOne({ userId, seriesId });
        
        if (!existingView) {
          // First time this user is viewing this series
          // Create view record
          await UserSeriesView.create({
            userId,
            seriesId,
            firstViewedAt: new Date()
          });

          // Increment series viewCount
          await Series.findByIdAndUpdate(seriesId, {
            $inc: { viewCount: 1 }
          });
        }
      } catch (error) {
        // Don't fail the request if view tracking fails
        console.error('Error tracking series view:', error);
      }
    }

    // Build query with search
    let query = { seriesId };
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchNum = parseInt(search);
      if (!isNaN(searchNum)) {
        // If search is a number, search by episode number
        query.$or = [
          { title: { $regex: searchRegex } },
          { episode: searchNum }
        ];
      } else {
        // If search is text, search by title only
        query.title = { $regex: searchRegex };
      }
    }

    // Get episodes for this series (sorted by episode number)
    let episodes = await Episode.find(query)
      .sort({ episode: 1 });

    // Fix URLs to use current request host
    episodes = episodes.map(ep => {
      const epObj = ep.toObject();
      if (epObj.videoUrl) epObj.videoUrl = fixFileUrl(req, epObj.videoUrl);
      if (epObj.videoThumbnail) epObj.videoThumbnail = fixFileUrl(req, epObj.videoThumbnail);
      return epObj;
    });

    res.status(200).json({
      success: true,
      data: episodes
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
      message: 'Error fetching episodes',
      error: error.message
    });
  }
};

// @desc    Get single episode by ID
// @route   GET /api/episodes/:id
// @access  Public
exports.getEpisodeById = async (req, res) => {
  try {
    const episode = await Episode.findById(req.params.id).populate('seriesId', 'title');
    
    if (!episode) {
      return res.status(404).json({
        success: false,
        message: 'Episode not found'
      });
    }

    // Fix URLs to use current request host
    const epObj = episode.toObject();
    if (epObj.videoUrl) epObj.videoUrl = fixFileUrl(req, epObj.videoUrl);
    if (epObj.videoThumbnail) epObj.videoThumbnail = fixFileUrl(req, epObj.videoThumbnail);

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
      message: 'Error fetching episode',
      error: error.message
    });
  }
};

// @desc    Update episode
// @route   PUT /api/episodes/:id
// @access  Private
exports.updateEpisode = async (req, res) => {
  try {
    const { seriesId, episode } = req.body;

    const updateData = {};
    if (seriesId !== undefined) updateData.seriesId = seriesId;
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

    const episodeDoc = await Episode.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!episodeDoc) {
      return res.status(404).json({
        success: false,
        message: 'Episode not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Episode updated successfully',
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
      message: 'Error updating episode',
      error: error.message
    });
  }
};

// @desc    Delete episode
// @route   DELETE /api/episodes/:id
// @access  Private
exports.deleteEpisode = async (req, res) => {
  try {
    const episode = await Episode.findByIdAndDelete(req.params.id);

    if (!episode) {
      return res.status(404).json({
        success: false,
        message: 'Episode not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Episode deleted successfully',
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
      message: 'Error deleting episode',
      error: error.message
    });
  }
};

