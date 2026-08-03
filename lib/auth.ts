import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

/**
 * The signing key for every session on this site.
 *
 * This used to read `process.env.JWT_SECRET || 'your-secret-key'`. A fallback
 * like that isn't a default, it's a published password: the string is sitting
 * in a git repository, so any deploy that was missing the environment
 * variable would happily verify tokens anyone could mint for themselves —
 * including one claiming `role: 'owner'`. No configuration mistake should be
 * able to hand out staff sessions, so the fallback is gone.
 *
 * Resolved on first use rather than at import. Throwing at module scope takes
 * the whole production build down during page-data collection, which is how a
 * safety check turns itself into an outage.
 */
const MIN_SECRET_LENGTH = 32;

let cachedSecret: string | null = null;

function jwtSecret(): string {
  if (cachedSecret) return cachedSecret;

  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) {
    cachedSecret = configured;
    return cachedSecret;
  }

  // In production, a missing or weak key is fatal. Refusing to sign is bad;
  // signing with a key that is public knowledge is very much worse. The
  // message says exactly what to do so it's fixed in minutes.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `JWT_SECRET is ${configured ? `too short (${configured.length} characters)` : 'not set'}. ` +
        `It must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Generate one with: openssl rand -base64 48`
    );
  }

  // Locally, mint a throwaway per process. Sessions won't survive a restart,
  // which is a small price for never having a guessable key anywhere.
  cachedSecret = randomBytes(48).toString('base64');
  console.warn(
    '[auth] JWT_SECRET is not set — using a random per-process secret. ' +
      'Sessions will not persist across restarts. Set JWT_SECRET to fix.'
  );
  return cachedSecret;
}

/** Exported for tests, which need to re-resolve after changing the env. */
export function __resetJwtSecretCache() {
  cachedSecret = null;
}

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';
const AUTH_COOKIE_MAX_AGE = parseInt(
  process.env.AUTH_COOKIE_MAX_AGE || '604800'
); // 7 days

export interface AuthPayload {
  userId: string;
  email: string;
  role?: string;
  type: 'user';
}

export interface ClientAuthPayload {
  clientId: string;
  email: string;
  type: 'client';
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a password with its hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a JWT token for a user or client
 */
export function createToken(payload: AuthPayload | ClientAuthPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: '7d', algorithm: 'HS256' });
}

/**
 * Verify and decode a JWT token.
 *
 * The algorithm is pinned. Left unpinned, a verifier accepts whatever the
 * token's own header asks for — which is the basis of the classic
 * algorithm-confusion attacks, including a token that simply declares
 * `alg: none`. We only ever issue HS256, so we only ever accept HS256.
 */
export function verifyToken(
  token: string
): (AuthPayload | ClientAuthPayload) | null {
  try {
    const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    return decoded as AuthPayload | ClientAuthPayload;
  } catch {
    return null;
  }
}

/**
 * Short-lived signed state for the Gmail OAuth round-trip — Google redirects
 * back to our callback with this value verbatim, so it has to carry who's
 * connecting without relying on session cookies surviving the trip to
 * Google and back.
 */
export function createOAuthState(userId: string): string {
  return jwt.sign({ userId, purpose: 'gmail-oauth' }, jwtSecret(), {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
}

export function verifyOAuthState(state: string): string | null {
  try {
    const decoded = jwt.verify(state, jwtSecret(), { algorithms: ['HS256'] }) as {
      userId: string;
      purpose: string;
    };
    return decoded.purpose === 'gmail-oauth' ? decoded.userId : null;
  } catch {
    return null;
  }
}

/**
 * Set auth cookie
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Get auth cookie
 */
export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

/**
 * Clear auth cookie
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Get current session from cookie
 */
export async function getCurrentSession(): Promise<
  (AuthPayload | ClientAuthPayload) | null
> {
  const token = await getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Generate a random password for new clients.
 *
 * Uses the crypto RNG, not `Math.random()`. `Math.random()` is a fast
 * non-cryptographic generator whose internal state can be recovered from a
 * handful of observed outputs, so a client who saw one generated password
 * could predict the ones issued after it. These are emailed to real clients
 * and guard real project data.
 *
 * `randomInt` rather than a modulo of random bytes: modulo biases the result
 * toward the earlier characters of the alphabet, while `randomInt` rejects
 * and re-rolls to keep the distribution even.
 */
export function generateRandomPassword(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(randomInt(chars.length));
  }
  return password;
}
