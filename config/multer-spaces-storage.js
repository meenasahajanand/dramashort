const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

// DigitalOcean Spaces Configuration
const spacesEndpoint = process.env.DO_SPACES_ENDPOINT || 'https://blr1.digitaloceanspaces.com';
const spacesRegion = process.env.DO_SPACES_REGION || 'blr1';
const spacesBucket = process.env.DO_SPACES_BUCKET || 'videocall';
const spacesAccessKeyId = process.env.DO_SPACES_KEY;
const spacesSecretAccessKey = process.env.DO_SPACES_SECRET;

// Create S3 client for DigitalOcean Spaces
const s3Client = new S3Client({
  endpoint: spacesEndpoint,
  region: spacesRegion,
  credentials: {
    accessKeyId: spacesAccessKeyId,
    secretAccessKey: spacesSecretAccessKey
  },
  forcePathStyle: false,
  signatureVersion: 'v4'
});

// Custom Multer Storage Engine for DigitalOcean Spaces (AWS SDK v3)
const createSpacesStorage = (folder = 'shortdrama') => {
  return {
    _handleFile: async function (req, file, cb) {
      try {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
        const key = `${folder}/${name}-${uniqueSuffix}${ext}`;

        // Read file stream
        const chunks = [];
        file.stream.on('data', (chunk) => chunks.push(chunk));
        file.stream.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            
            // Upload to Spaces with public-read ACL
            const command = new PutObjectCommand({
              Bucket: spacesBucket,
              Key: key,
              Body: buffer,
              ContentType: file.mimetype || 'application/octet-stream',
              ACL: 'public-read' // Make files publicly accessible
            });

            await s3Client.send(command);

            // Generate public URL
            const location = `https://${spacesBucket}.${spacesRegion}.digitaloceanspaces.com/${key}`;

            // Return file info (similar to multer-s3)
            cb(null, {
              location: location,
              key: key,
              bucket: spacesBucket,
              size: buffer.length,
              mimetype: file.mimetype
            });
          } catch (error) {
            cb(error);
          }
        });
        file.stream.on('error', (error) => {
          cb(error);
        });
      } catch (error) {
        cb(error);
      }
    },
    _removeFile: async function (req, file, cb) {
      // Optional: Implement file deletion if needed
      cb(null);
    }
  };
};

// Get public URL for a file
const getFileUrl = (key) => {
  if (!key) return null;
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  return `https://${spacesBucket}.${spacesRegion}.digitaloceanspaces.com/${cleanKey}`;
};

// Get base URL for Spaces
const getBaseUrl = () => {
  return `https://${spacesBucket}.${spacesRegion}.digitaloceanspaces.com`;
};

module.exports = {
  createSpacesStorage,
  getFileUrl,
  getBaseUrl,
  s3Client,
  spacesBucket,
  spacesEndpoint
};

