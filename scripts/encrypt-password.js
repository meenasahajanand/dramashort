const { encrypt } = require('../utils/encrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔐 MongoDB Password Encryption Tool\n');

rl.question('Enter your MongoDB password: ', (password) => {
  if (!password || password.trim() === '') {
    console.error('❌ Password cannot be empty!');
    rl.close();
    process.exit(1);
  }
  
  const encrypted = encrypt(password.trim());
  console.log('\n✅ Password encrypted successfully!\n');
  console.log('Add this to your .env file:');
  console.log('─────────────────────────────────────────');
  console.log(`MONGODB_PASSWORD_ENCRYPTED=${encrypted}`);
  console.log('─────────────────────────────────────────\n');
  console.log('Or use plain text (not recommended):');
  console.log(`MONGODB_PASSWORD=${password.trim()}\n`);
  
  rl.close();
});

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log('\n\n❌ Cancelled.');
  rl.close();
  process.exit(0);
});

