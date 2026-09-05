import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  let keyString = env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyString) {
    if (env.NODE_ENV === 'production') {
      throw new Error('PRODUCTION CONFIGURATION ERROR: CREDENTIAL_ENCRYPTION_KEY is required in production.');
    }
    keyString = 'default_development_key_do_not_use_in_prod';
  }
  // Hash to ensure exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(keyString).digest();
}

export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptCredential(ciphertextBlob: string): string {
  if (!ciphertextBlob) throw new Error('No ciphertext provided');
  
  const key = getEncryptionKey();
  const parts = ciphertextBlob.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
