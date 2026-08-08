import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { jwtSecret } from '@/lib/env';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';

/** Seven days, in seconds. */
const DEFAULT_AUTH_COOKIE_MAX_AGE = 604800;

/**
 * How long a session cookie lives, in **seconds**.
 *
 * This was `parseInt(process.env.AUTH_COOKIE_MAX_AGE || '604800')`, and
 * parseInt reads as far as it understands and then stops without complaining.
 * `.env.example` offers this as an override with no stated units, so the
 * natural ways to write a duration all parse to something, and all of them
 * are wrong:
 *
 *   "7d"       ->  7 seconds
 *   "2 weeks"  ->  2 seconds
 *   "1e5"      ->  1 second
 *   "abc"      ->  NaN
 *   "-1"       ->  already expired
 *
 * A seven-second session is the worst of those, because it looks like a
 * working login. The password is accepted, the redirect happens, and the next
 * page load is back at the login screen — forever, on every device, with
 * nothing in any log, because nothing failed. NaN is at least loud: it
 * produces an invalid Max-Age and the cookie is discarded outright.
 *
 * So the value is validated rather than parsed. Anything that is not a whole
 * positive number of seconds is refused by name, with the unit spelled out,
 * and the default is used instead — a working seven-day session and a line in
 * the log beats an unusable deployment and silence. Matching lib/env.ts,
 * which takes the same view of a secret it cannot trust.
 */
/** Exported so the validation is testable without reloading the module. */
export function resolveAuthCookieMaxAge(): number {
  const raw = process.env.AUTH_COOKIE_MAX_AGE?.trim();
  if (!raw) return DEFAULT_AUTH_COOKIE_MAX_AGE;

  // Digits only. Number() would accept "1e5" and " 12 ", parseInt accepts
  // "7d" — this accepts what the variable actually means and nothing else.
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    console.error(
      `[auth] AUTH_COOKIE_MAX_AGE is "${raw}", which is not a positive whole number of ` +
        `SECONDS. Using the default of ${DEFAULT_AUTH_COOKIE_MAX_AGE} (7 days) instead. ` +
        'Note the unit: 7 days is 604800, not "7d".'
    );
    return DEFAULT_AUTH_COOKIE_MAX_AGE;
  }

  return Number(raw);
}

const AUTH_COOKIE_MAX_AGE = resolveAuthCookieMaxAge();

export interface AuthPayload {
  userId: string;
  email: string;
  role?: string;
  type: 'user';
  /** Issued-at, in seconds. Added by jwt.sign; read back for revocation. */
  iat?: number;
}

export interface ClientAuthPayload {
  clientId: string;
  email: string;
  type: 'client';
  /** Issued-at, in seconds. Added by jwt.sign; read back for revocation. */
  iat?: number;
}

/**
 * Was this token minted before the account revoked its sessions?
 *
 * Sessions are stateless 7-day JWTs, so "log everyone out" can't mean
 * deleting server-side rows — there are none. Instead each account carries a
 * `sessionsValidFrom` watermark, and a token issued before it is refused for
 * the remainder of its life.
 *
 * The comparison is deliberately at whole-second granularity. `iat` is in
 * seconds and is floored, so a token minted 200ms *after* a revocation in the
 * same wall-clock second carries an `iat` that looks earlier than the
 * watermark. Comparing raw milliseconds would sign the user out of the
 * session they just re-secured by changing their password — the one flow
 * where this must not happen. Flooring both sides costs a sub-second window
 * and removes that whole class of false positive.
 */
export function isTokenRevoked(
  issuedAtSeconds: number | undefined,
  sessionsValidFrom: Date | null | undefined
): boolean {
  if (!sessionsValidFrom) return false;
  // A token with no `iat` predates this mechanism and can't be placed in
  // time; treat it as revoked rather than trusting it.
  if (typeof issuedAtSeconds !== 'number') return true;
  return issuedAtSeconds < Math.floor(sessionsValidFrom.getTime() / 1000);
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
    // Algorithms pinned rather than inferred from the token's own header.
    // jsonwebtoken already refuses `alg: none` when a key is supplied, but
    // that is a property of the library's defaults; saying it here means the
    // guarantee survives a version bump, and is checked by a test.
    const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
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
export function createOAuthState(userId: string, opts: { delegated?: boolean } = {}): string {
  return jwt.sign(
    // `delegated` says an owner is connecting a mailbox that is not their own,
    // which the callback needs purely to know where to send them afterwards:
    // landing back on your own Settings, which still shows your own mailbox
    // unchanged, reads as "it didn't work". It is signed with everything else
    // rather than passed as a query parameter because it is a statement about
    // what this round-trip is, and the round-trip is the thing being signed.
    { userId, purpose: 'gmail-oauth', ...(opts.delegated ? { delegated: true } : {}) },
    jwtSecret(),
    { expiresIn: '10m' }
  );
}

export interface OAuthStateClaims {
  /** Whose row the callback will write the connection to. */
  userId: string;
  /** True when an owner is connecting somebody else's mailbox. */
  delegated: boolean;
}

export function verifyOAuthState(state: string): OAuthStateClaims | null {
  try {
    const decoded = jwt.verify(state, jwtSecret()) as {
      userId: string;
      purpose: string;
      delegated?: boolean;
    };
    if (decoded.purpose !== 'gmail-oauth') return null;
    return { userId: decoded.userId, delegated: decoded.delegated === true };
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
