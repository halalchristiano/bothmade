import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { jwtSecret } from '@/lib/env';

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
  return jwt.sign(payload, jwtSecret(), { expiresIn: '7d' });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(
  token: string
): (AuthPayload | ClientAuthPayload) | null {
  try {
    const decoded = jwt.verify(token, jwtSecret());
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
  return jwt.sign({ userId, purpose: 'gmail-oauth' }, jwtSecret(), { expiresIn: '10m' });
}

export function verifyOAuthState(state: string): string | null {
  try {
    const decoded = jwt.verify(state, jwtSecret()) as { userId: string; purpose: string };
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
 * crypto.randomBytes, not Math.random: this is the only credential a client
 * ever gets handed, it's emailed to them in plaintext, and Math.random is a
 * seeded PRNG whose output stream is recoverable from a handful of samples.
 * Two clients onboarded from the same warm serverless instance would have
 * had related passwords.
 *
 * crypto.randomInt rejects out-of-range draws internally, so no modulo bias.
 */
export function generateRandomPassword(length = 20): string {
  // Unambiguous alphabet — no 0/O or 1/l/I, since these get read off a
  // screen and typed by hand. Symbols kept to ones that survive a copy-paste
  // out of an email client without being mangled.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
}
