import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const DEFAULT_JWT_SECRET = 'your-secret-key';

/**
 * Resolve the JWT signing secret. In production a missing secret — or the
 * shipped placeholder — is fatal: with a known key anyone can forge an admin
 * session, so we refuse to sign or verify rather than run wide open. The
 * default is tolerated only outside production, for local-dev convenience.
 */
function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value === DEFAULT_JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET is not set (or is the insecure default). Set a strong, unique JWT_SECRET before running in production.'
      );
    }
    return DEFAULT_JWT_SECRET;
  }
  return value;
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
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(
  token: string
): (AuthPayload | ClientAuthPayload) | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    return decoded as AuthPayload | ClientAuthPayload;
  } catch (error) {
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
  return jwt.sign({ userId, purpose: 'gmail-oauth' }, getJwtSecret(), { expiresIn: '10m' });
}

export function verifyOAuthState(state: string): string | null {
  try {
    const decoded = jwt.verify(state, getJwtSecret()) as { userId: string; purpose: string };
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
 * Generate a random password for new clients
 */
export function generateRandomPassword(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  // crypto.randomInt is a CSPRNG — Math.random() is predictable from observed
  // output, and this password is emailed to a paying client as their first
  // credential, so it must not be guessable.
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
}
