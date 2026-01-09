const crypto = require('crypto');

// Encryption key - should be in .env for production
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dramashorts-encryption-key-2024-change-in-production';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Create a hash of the encryption key (32 bytes for AES-256)
const getKey = () => {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
};

/**
 * Encrypt text
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted text (hex format)
 */
function encrypt(text) {
  if (!text) return '';
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Prepend IV to encrypted data (IV doesn't need to be secret)
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt text
 * @param {string} encryptedText - Encrypted text (hex format)
 * @returns {string} - Decrypted text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return '';
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return '';
  }
}

module.exports = {
  encrypt,
  decrypt
};

