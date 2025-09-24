import crypto from 'crypto';

/**
 * Token Encryption Module
 * Implements AES-256-GCM encryption for secure token storage
 * Following Shopify's best practices for token security
 */

// Use environment variable or generate a secure key
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ||
  crypto.createHash('sha256').update(
    process.env.JWT_SECRET || 'default-encryption-key-change-in-production'
  ).digest();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Encrypts a token using AES-256-GCM
 * Returns a string containing: salt:iv:authTag:encrypted
 */
export async function encryptToken(token: string): Promise<string> {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from master key and salt
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 10000, 32, 'sha256');

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the token
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final()
    ]);

    // Get the auth tag
    const authTag = cipher.getAuthTag();

    // Combine salt, iv, authTag, and encrypted data
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    // Return as base64 string
    return combined.toString('base64');
  } catch (error) {
    console.error('[Token Encryption] Encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypts a token encrypted with encryptToken
 */
export async function decryptToken(encryptedToken: string): Promise<string> {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedToken, 'base64');

    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Derive key from master key and salt
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 10000, 32, 'sha256');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the token
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[Token Encryption] Decryption failed:', error);
    throw new Error('Failed to decrypt token');
  }
}

/**
 * Checks if a string looks like an encrypted token
 */
export function isEncryptedToken(token: string): boolean {
  try {
    // Check if it's a valid base64 string
    const decoded = Buffer.from(token, 'base64');

    // Check if it has the minimum length for our encrypted format
    // salt(32) + iv(16) + tag(16) + at least 1 byte of data
    return decoded.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Rotates an encrypted token with a new encryption
 * Useful when rotating encryption keys
 */
export async function rotateToken(encryptedToken: string): Promise<string> {
  const decrypted = await decryptToken(encryptedToken);
  return await encryptToken(decrypted);
}

/**
 * Generates a secure encryption key for production use
 * This should be stored securely and never committed to code
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}