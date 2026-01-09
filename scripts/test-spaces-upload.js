const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config();

// DigitalOcean Spaces Configuration
const spacesEndpoint = process.env.DO_SPACES_ENDPOINT || 'https://blr1.digitaloceanspaces.com';
const spacesRegion = process.env.DO_SPACES_REGION || 'blr1';
const spacesBucket = process.env.DO_SPACES_BUCKET || 'videocall';
const spacesAccessKeyId = process.env.DO_SPACES_KEY;
const spacesSecretAccessKey = process.env.DO_SPACES_SECRET;

console.log('🧪 Testing DigitalOcean Spaces Configuration...\n');

// Check if credentials are set
if (!spacesAccessKeyId || !spacesSecretAccessKey) {
  console.error('❌ ERROR: DigitalOcean Spaces credentials not found!');
  console.error('\nPlease add to .env file:');
  console.error('DO_SPACES_KEY=<your-access-key>');
  console.error('DO_SPACES_SECRET=<your-secret-key>');
  process.exit(1);
}

console.log('✅ Credentials found');
console.log(`   Endpoint: ${spacesEndpoint}`);
console.log(`   Region: ${spacesRegion}`);
console.log(`   Bucket: ${spacesBucket}\n`);

// Create S3 client
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

// Test 1: List objects in bucket
async function testListObjects() {
  try {
    console.log('📋 Test 1: Listing objects in bucket...');
    const command = new ListObjectsV2Command({
      Bucket: spacesBucket,
      MaxKeys: 5
    });
    
    const response = await s3Client.send(command);
    console.log(`✅ Success! Found ${response.KeyCount || 0} objects`);
    
    if (response.Contents && response.Contents.length > 0) {
      console.log('\n   Sample files:');
      response.Contents.slice(0, 3).forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.Key} (${(item.Size / 1024).toFixed(2)} KB)`);
      });
    }
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    if (error.name === 'NoSuchBucket') {
      console.error('   Bucket does not exist or you don\'t have access');
    } else if (error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') {
      console.error('   Invalid credentials - check DO_SPACES_KEY and DO_SPACES_SECRET');
    }
    return false;
  }
}

// Test 2: Upload a test file
async function testUpload() {
  try {
    console.log('\n📤 Test 2: Uploading test file...');
    const testContent = `Test file uploaded at ${new Date().toISOString()}`;
    const testKey = `test/test-${Date.now()}.txt`;
    
    // Try without ACL first (some buckets don't support ACL or have restrictions)
    const putParams = {
      Bucket: spacesBucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain'
    };
    
    const command = new PutObjectCommand(putParams);
    
    await s3Client.send(command);
    
    const fileUrl = `https://${spacesBucket}.${spacesRegion}.digitaloceanspaces.com/${testKey}`;
    console.log('✅ Upload successful!');
    console.log(`   File URL: ${fileUrl}`);
    console.log(`   File Key: ${testKey}`);
    return true;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    console.error(`   Error Code: ${error.name || 'Unknown'}`);
    
    if (error.name === 'AccessDenied' || error.message.includes('Access Denied')) {
      console.error('\n💡 Possible solutions:');
      console.error('   1. Check if your Spaces Access Key has WRITE permissions');
      console.error('   2. Go to DigitalOcean → API → Spaces Keys');
      console.error('   3. Verify the key has "Full Access" or "Write" permissions');
      console.error('   4. If using restricted key, regenerate with full access');
      console.error('   5. Check bucket CORS settings allow uploads');
    }
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('─────────────────────────────────────────\n');
  
  const listTest = await testListObjects();
  const uploadTest = await testUpload();
  
  console.log('\n─────────────────────────────────────────');
  console.log('📊 Test Results:');
  console.log(`   List Objects: ${listTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Upload File: ${uploadTest ? '✅ PASS' : '❌ FAIL'}`);
  
  if (listTest && uploadTest) {
    console.log('\n🎉 All tests passed! DigitalOcean Spaces is configured correctly.');
    console.log('\n💡 Your uploads will be stored at:');
    console.log(`   https://${spacesBucket}.${spacesRegion}.digitaloceanspaces.com/`);
  } else {
    console.log('\n⚠️  Some tests failed. Please check your configuration.');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});

