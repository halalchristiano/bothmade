import crypto from 'crypto';

// Symmetric encryption for at-rest secrets (Gmail app passwords / refresh
// tokens) using a key derived from SESSION_SECRET, so we don't need a separate
// env var to manage.
const DEFAULT_SESSION_SECRET = 'bothmade-dev-secret';

/**
 * Derive the AES key. In production a missing SESSION_SECRET — or the shipped
 * default — is fatal: anyone with DB read plus the known key could decrypt
 * every stored Gmail token, so we refuse rather than encrypt under a public
 * key. Outside production the default is tolerated for local dev. (Derivation
 * is unchanged, so tokens encrypted before this guard still decrypt.)
 */
function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === DEFAULT_SESSION_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET is not set (or is the insecure default). Set a strong, unique SESSION_SECRET before storing secrets in production.'
      );
    }
    return crypto.createHash('sha256').update(DEFAULT_SESSION_SECRET).digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
