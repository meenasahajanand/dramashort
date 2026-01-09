const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Trust proxy for accurate IP detection (important for IP blocking)
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve React Admin Panel (production build)
const adminBuildPath = path.join(__dirname, 'admin-react', 'dist');
if (require('fs').existsSync(adminBuildPath)) {
  app.use(express.static(adminBuildPath));
  console.log('✅ React Admin Panel build found and will be served');
} else {
  console.log('⚠️  React Admin Panel build not found. Run: cd admin-react && npm run build');
}

// MongoDB Connection
// DigitalOcean MongoDB connection string
// If MONGODB_URI is provided, use it directly; otherwise build from components
const mongoUriFromEnv = process.env.MONGODB_URI;

const mongoUsername = process.env.MONGODB_USERNAME || 'doadmin';
let mongoPassword = process.env.MONGODB_PASSWORD || '';
const mongoPasswordEncrypted = process.env.MONGODB_PASSWORD_ENCRYPTED || '';
let mongoHost = process.env.MONGODB_HOST || 'db-mongodb-blr1-08387-76019728.mongo.ondigitalocean.com';
const mongoDatabase = process.env.MONGODB_DATABASE || 'shortdrama';

// Decrypt password if encrypted version is provided
if (mongoPasswordEncrypted && !mongoPassword) {
  const { decrypt } = require('./utils/encrypt');
  // Trim whitespace and remove quotes if present
  const cleanEncrypted = mongoPasswordEncrypted.trim().replace(/^["']|["']$/g, '');
  mongoPassword = decrypt(cleanEncrypted);
  
  // Check if decryption failed
  if (!mongoPassword) {
    console.error('❌ ERROR: Failed to decrypt MONGODB_PASSWORD_ENCRYPTED!');
    console.error('Encrypted value received:', cleanEncrypted.substring(0, 50) + '...');
    console.error('\nPossible reasons:');
    console.error('   1. Encrypted value is corrupted or invalid');
    console.error('   2. Encryption key mismatch (ENCRYPTION_KEY changed)');
    console.error('   3. Encrypted value format is incorrect');
    console.error('   4. Extra spaces or quotes in .env file');
    console.error('\n💡 Solutions:');
    console.error('   - Test decryption: node scripts/test-decrypt.js "<your-encrypted-value>"');
    console.error('   - Re-encrypt password: npm run encrypt:password');
    console.error('   - Or use plain text: MONGODB_PASSWORD=your_password');
    process.exit(1);
  }
  console.log('✅ Password decrypted successfully');
}

// Validate MongoDB password
if (!mongoPassword) {
  console.error('❌ ERROR: MONGODB_PASSWORD or MONGODB_PASSWORD_ENCRYPTED is not set in .env file!');
  console.error('Please add your MongoDB password to .env file:');
  console.error('Option 1 (Plain text): MONGODB_PASSWORD=your_actual_password_here');
  console.error('Option 2 (Encrypted): MONGODB_PASSWORD_ENCRYPTED=<encrypted_value>');
  console.error('\nTo encrypt password, run: npm run encrypt:password');
  process.exit(1);
}

// If MONGODB_URI is provided directly, use it as-is (don't change database name)
let mongoUri;
if (mongoUriFromEnv) {
  // Use provided URI exactly as given - don't change the database name
  // The user's connection string already has the correct database name
  mongoUri = mongoUriFromEnv;
  
  // Extract database name from URI for logging
  const uriMatch = mongoUri.match(/mongodb\+srv:\/\/[^\/]+\/([^\/\?]+)/);
  const uriDatabase = uriMatch ? uriMatch[1] : 'unknown';
  console.log(`🔗 Using database from connection string: ${uriDatabase}`);
  
  // Ensure authSource and tls are set (add if missing)
  if (!mongoUri.includes('authSource=')) {
    mongoUri += (mongoUri.includes('?') ? '&' : '?') + 'authSource=admin';
  }
  if (!mongoUri.includes('tls=')) {
    mongoUri += (mongoUri.includes('?') ? '&' : '?') + 'tls=true';
  }
} else {
  // Remove mongodb+srv:// prefix if present in host
  mongoHost = mongoHost.replace(/^mongodb\+srv:\/\//, '');
  
  // Extract replicaSet from host if possible (format: db-mongodb-blr1-XXXXX-XXXXX)
  let replicaSet = 'db-mongodb-blr1-08387'; // Default
  const hostMatch = mongoHost.match(/db-mongodb-blr1-(\d+)/);
  if (hostMatch) {
    replicaSet = `db-mongodb-blr1-${hostMatch[1]}`;
  }
  
  // Build MongoDB URI
  mongoUri = `mongodb+srv://${mongoUsername}:${encodeURIComponent(mongoPassword)}@${mongoHost}/${mongoDatabase}?tls=true&authSource=admin&replicaSet=${replicaSet}`;
}

// Log connection info (without password)
console.log('🔌 Connecting to MongoDB...');
console.log(`   Host: ${mongoHost}`);
console.log(`   Database: ${mongoDatabase}`);
console.log(`   Username: ${mongoUsername}`);

mongoose.connect(mongoUri)
.then(async () => {
  console.log('Connected to MongoDB...');
  
  // Log database and collection info
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`📊 Connected to database: ${dbName}`);
  
  // List all collections
  try {
    const collections = await db.listCollections().toArray();
    console.log(`📁 Available collections (${collections.length}):`);
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    
    // Check document counts in main collections
    const seriesCount = await db.collection('series').countDocuments({});
    const comingSoonSeriesCount = await db.collection('comingsoonseries').countDocuments({});
    const episodesCount = await db.collection('episodes').countDocuments({});
    const comingSoonEpisodesCount = await db.collection('comingsoonepisodes').countDocuments({});
    
    console.log(`\n📈 Document counts:`);
    console.log(`   - series: ${seriesCount}`);
    console.log(`   - comingsoonseries: ${comingSoonSeriesCount}`);
    console.log(`   - episodes: ${episodesCount}`);
    console.log(`   - comingsoonepisodes: ${comingSoonEpisodesCount}`);
  } catch (err) {
    console.error('Error listing collections:', err.message);
  }

  // One-time cleanup: drop legacy username unique index if it exists
  try {
    const User = require('./models/User');
    // This will throw if index doesn't exist - we safely ignore that case
    await User.collection.dropIndex('username_1');
    console.log('Dropped legacy username_1 index from users collection (if it existed)');
  } catch (err) {
    if (err && err.codeName !== 'IndexNotFound' && err.message !== 'index not found') {
      console.warn('Could not drop username_1 index (may already be removed):', err.message);
    }
  }

  // Ensure ComingSoonEpisode indexes match the schema (fix legacy unique index on seriesId + episode)
  try {
    const ComingSoonEpisode = require('./models/ComingSoonEpisode');
    const collection = ComingSoonEpisode.collection;
    
    // List all existing indexes first
    const existingIndexes = await collection.indexes();
    console.log('📋 Existing indexes on comingsoonepisodes collection:');
    existingIndexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)} (unique: ${idx.unique || false})`);
    });
    
    // Force-drop ALL indexes (safer to rebuild cleanly), then rebuild
    try {
      await collection.dropIndexes();
      console.log('🧹 Dropped ALL indexes on comingsoonepisodes (will rebuild cleanly)');
    } catch (err) {
      if (err.codeName === 'IndexNotFound' || err.message?.includes('index not found')) {
        console.log('ℹ️  No indexes to drop (collection was empty)');
      } else {
        console.warn('⚠️  Could not drop all indexes, will continue:', err.message);
      }
    }

    // Sync indexes with the current schema (will recreate with partialFilterExpression)
    console.log('🔄 Syncing indexes with schema...');
    await ComingSoonEpisode.syncIndexes({ background: false });
    console.log('✅ Synced indexes for ComingSoonEpisode collection');
    
    // Verify indexes after sync
    const finalIndexes = await collection.indexes();
    console.log('📋 Final indexes on comingsoonepisodes collection:');
    finalIndexes.forEach(idx => {
      const partial = idx.partialFilterExpression ? JSON.stringify(idx.partialFilterExpression) : 'none';
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)} (unique: ${idx.unique || false}, partial: ${partial})`);
    });
  } catch (err) {
    console.error('❌ Error syncing ComingSoonEpisode indexes:', err.message);
    console.error('Stack:', err.stack);
  }

  // Start cron job for releasing coming soon episodes
  const { startCronJob } = require('./jobs/releaseComingSoonEpisodes');
  startCronJob();
})
.catch((error) => {
  console.error('\n❌ MongoDB connection error:', error.message);
  if (error.code === 18 || error.codeName === 'AuthenticationFailed') {
    console.error('\n💡 Authentication Failed! Possible reasons:');
    console.error('   1. Wrong password in .env file (MONGODB_PASSWORD)');
    console.error('   2. Password contains special characters - make sure it\'s properly set');
    console.error('   3. Username is incorrect (should be: doadmin)');
    console.error('\n   Please check your .env file and verify:');
    console.error('   - MONGODB_USERNAME=doadmin');
    console.error('   - MONGODB_PASSWORD=<your-actual-password>');
    console.error('   - MONGODB_HOST=db-mongodb-blr1-08387-76019728.mongo.ondigitalocean.com');
    console.error('   - MONGODB_DATABASE=shortdrama');
  }
  process.exit(1);
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/series', require('./routes/seriesRoutes'));
app.use('/api/episodes', require('./routes/episodeRoutes'));
app.use('/api/coming-soon-episodes', require('./routes/comingSoonEpisodeRoutes'));
app.use('/api/coming-soon-series', require('./routes/comingSoonSeriesRoutes'));
app.use('/api/user/saved-series', require('./routes/userSavedSeriesRoutes'));
app.use('/api/series-transfer-logs', require('./routes/seriesTransferLogRoutes'));
app.use('/api/admin/users', require('./routes/adminUserRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/tags', require('./routes/tagRoutes'));
app.use('/api/user', require('./routes/userEpisodeRoutes'));
app.use('/api/history', require('./routes/historyRoutes'));
app.use('/api/coins', require('./routes/coinRoutes'));

// Health check API
app.get('/api', (req, res) => {
  res.json({ message: 'Drama Shorts API is running' });
});

// Serve React Admin Panel for all non-API routes (only if build exists)
app.get('*', (req, res) => {
  // Don't serve React app for API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  
  // Serve React app for all other routes (if build exists)
  const indexPath = path.join(adminBuildPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ 
      message: 'Admin panel not built. Run: cd admin-react && npm run build',
      api: 'API is running at /api'
    });
  }
});

const PORT = process.env.PORT || 7676;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 allows access from network

const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://<your-ip>:${PORT}`);
  console.log('\nTo find your IP address:');
  console.log('Windows: ipconfig (look for IPv4 Address)');
  console.log('Mac/Linux: ifconfig or ip addr');
});

// Handle port conflicts gracefully
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use!`);
    console.error(`\nPlease do one of the following:`);
    console.error(`1. Stop the process using port ${PORT}`);
    console.error(`   Windows: netstat -ano | findstr :${PORT}`);
    console.error(`   Then kill the process: taskkill /PID <PID> /F`);
    console.error(`\n2. Or use a different port:`);
    console.error(`   $env:PORT=5000; npm start`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});

