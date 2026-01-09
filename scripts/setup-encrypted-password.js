const { encrypt, decrypt } = require('../utils/encrypt');
const fs = require('fs');
const path = require('path');

// Your MongoDB password
const password = 'fDM51CFm2O4398U6';

console.log('🔐 Setting up encrypted MongoDB password...\n');

// Encrypt the password
const encrypted = encrypt(password);

// Test decryption
const decrypted = decrypt(encrypted);

if (decrypted === password) {
  console.log('✅ Encryption/Decryption test successful!\n');
  console.log('📋 Add this to your .env file:');
  console.log('─────────────────────────────────────────');
  console.log(`MONGODB_PASSWORD_ENCRYPTED=${encrypted}`);
  console.log('─────────────────────────────────────────\n');
  console.log('⚠️  Important:');
  console.log('   1. Remove or comment out MONGODB_PASSWORD line');
  console.log('   2. Add MONGODB_PASSWORD_ENCRYPTED with the value above');
  console.log('   3. No quotes, no spaces');
  console.log('   4. Restart server: npm run dev\n');
} else {
  console.error('❌ Encryption test failed!');
  console.error('Original:', password);
  console.error('Decrypted:', decrypted);
  process.exit(1);
}

