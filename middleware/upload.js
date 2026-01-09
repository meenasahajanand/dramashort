const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Check if DigitalOcean Spaces is configured
const useSpaces = process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET;
let storage;

if (useSpaces) {
  // Use DigitalOcean Spaces - store in shortdrama folder
  const { createSpacesStorage } = require('../config/multer-spaces-storage');
  storage = createSpacesStorage('shortdrama');
} else {
  // Fallback to local storage
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      // Generate unique filename: timestamp-random-originalname
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, name + '-' + uniqueSuffix + ext);
    }
  });
}

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  // Accept image files only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// File filter for videos and images (for episodes) - support all video types
const videoFileFilter = (req, file, cb) => {
  // Accept all video files and image files
  // Support common video formats: mp4, avi, mkv, mov, wmv, flv, webm, m4v, 3gp, etc.
  const videoMimeTypes = [
    'video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska',
    'video/x-ms-wmv', 'video/x-flv', 'video/webm', 'video/mp2t', 'video/3gpp',
    'video/x-m4v', 'video/ogg', 'video/x-ms-asf', 'video/x-ms-wm', 'video/x-ms-wmx',
    'video/x-ms-wvx', 'video/divx', 'video/x-divx', 'video/vnd.rn-realvideo'
  ];
  
  const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', 
    '.m4v', '.3gp', '.ogv', '.divx', '.rm', '.rmvb', '.asf', '.mpg', '.mpeg', '.m2v'];
  
  const fileExt = path.extname(file.originalname).toLowerCase();
  const isVideoMime = file.mimetype.startsWith('video/') || videoMimeTypes.includes(file.mimetype);
  const isVideoExt = videoExtensions.includes(fileExt);
  const isImage = file.mimetype.startsWith('image/');
  
  if (isVideoMime || isVideoExt || isImage) {
    cb(null, true);
  } else {
    // Allow all files - let the application decide
    cb(null, true);
  }
};

// Configure multer for images (series)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Configure multer for videos (episodes) - larger file size limit
let uploadVideoStorage;
if (useSpaces) {
  const { createSpacesStorage } = require('../config/multer-spaces-storage');
  uploadVideoStorage = createSpacesStorage('shortdrama'); // Store videos in shortdrama folder
} else {
  uploadVideoStorage = storage; // Use same local storage
}

const uploadVideo = multer({
  storage: uploadVideoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for videos
  }
});

// Middleware for handling image and banner uploads
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'banner', maxCount: 1 }
]);

// Middleware for handling single episode upload (video + thumbnail)
const uploadEpisodeFiles = uploadVideo.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Middleware for handling batch episode uploads (video + videoThumbnail fields)
const uploadBatchEpisodeFiles = uploadVideo.fields([
  { name: 'video', maxCount: 100 },  // Video files (1-100 videos in single field)
  { name: 'videoThumbnail', maxCount: 100 }, // Video thumbnails (1-100 thumbnails in single field)
  { name: 'episodes', maxCount: 100 },  // Backward compatibility
  { name: 'videothumbnail', maxCount: 100 }, // Backward compatibility
  { name: 'thumbnail', maxCount: 100 } // Backward compatibility
]);

module.exports = {
  uploadFields,
  uploadEpisodeFiles,
  uploadBatchEpisodeFiles,
  upload,
  uploadVideo
};

