const { decrypt, encrypt } = require('../utils/encrypt');

// Test decryption
const encryptedValue = process.argv[2];

if (!encryptedValue) {
  console.error('❌ Usage: node scripts/test-decrypt.js <encrypted-value>');
  process.exit(1);
}

console.log('🔐 Testing decryption...\n');
console.log('Encrypted value:', encryptedValue);
console.log('─────────────────────────────────────────\n');

const decrypted = decrypt(encryptedValue);

if (decrypted) {
  console.log('✅ Decryption successful!');
  console.log('Decrypted password:', decrypted);
  console.log('\n💡 If this matches your password, decryption is working correctly.');
} else {
  console.error('❌ Decryption failed!');
  console.error('Possible reasons:');
  console.error('   1. Encrypted value is corrupted');
  console.error('   2. Encryption key mismatch');
  console.error('   3. Invalid format');
}

