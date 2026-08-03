import crypto from 'crypto';
import { gmailEncryptionKey, legacyGmailEncryptionKey } from '@/lib/env';

// Symmetric encryption for at-rest mailbox secrets (Gmail app passwords and
// Google refresh tokens). The key comes from GMAIL_ENCRYPTION_KEY — its own
// env var rather than a second use of SESSION_SECRET, so the two can be
// rotated independently and a leaked session secret doesn't also hand over
// every connected mailbox.

function deriveKey(material: string): Buffer {
  return crypto.createHash('sha256').update(material).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(gmailEncryptionKey()), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptWith(material: string, encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(material), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Decrypts with the current key, falling back to the pre-split key derived
 * from SESSION_SECRET so mailboxes connected before GMAIL_ENCRYPTION_KEY
 * existed keep working. GCM's auth tag makes "wrong key" a clean failure
 * rather than garbage output, so trying both is safe.
 *
 * Re-encrypting on the legacy path isn't done here — decryptSecret has no
 * business writing to the database. Reconnecting a mailbox in Settings
 * re-encrypts it under the current key.
 */
export function decryptSecret(encoded: string): string {
  try {
    return decryptWith(gmailEncryptionKey(), encoded);
  } catch (error) {
    const legacy = legacyGmailEncryptionKey();
    if (legacy) {
      try {
        return decryptWith(legacy, encoded);
      } catch {
        // fall through to the original error — the current key is the one
        // that's expected to work, so that's the more useful failure.
      }
    }
    throw error;
  }
}
