import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/**
 * The signing key for every session on this site.
 *
 * This previously read `process.env.JWT_SECRET || 'your-secret-key'`. A
 * fallback like that is not a default, it is a published password: the string
 * is in the repository, so any deploy missing the environment variable would
 * happily verify tokens that anyone could mint for themselves — including one
 * claiming `role: 'admin'`. There is no configuration mistake that should be
 * able to hand out staff sessions, so the fallback is gone.
 *
 * Resolved lazily rather than at module load. Throwing at import time takes
 * the whole production build down during page-data collection, which is how a
 * safety check turns into an outage.
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

  // In production a weak or missing secret is fatal — fail closed, and say
  // exactly what is wrong so it is fixed in minutes rather than guessed at.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `JWT_SECRET is ${configured ? `too short (${configured.length} chars)` : 'not set'}. ` +
        `It must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Generate one with: openssl rand -base64 48`
    );
  }

  // Locally, generate a throwaway secret per process. Sessions won't survive
  // a restart, which is a small price for never having a guessable key.
  cachedSecret = randomBytes(48).toString('base64');
  console.warn(
    '[auth] JWT_SECRET not set — using a random per-process secret. ' +
      'Sessions will not persist across restarts. Set JWT_SECRET to fix.'
  );
  return cachedSecret;
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
  /** Session version this token was issued at. Absent on tokens minted before
   *  revocation existed, which are treated as version 0 — the default every
   *  existing row already has, so nobody is signed out by the upgrade. */
  sv?: number;
}

export interface ClientAuthPayload {
  clientId: string;
  email: string;
  type: 'client';
  sv?: number;
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
 * The algorithm is pinned. Without it a verifier accepts whatever the token's
 * own header asks for, which is the basis of the classic algorithm-confusion
 * attacks — a token claiming `alg: none`, or an RS256 token verified with the
 * public key as an HMAC key. We issue HS256, so we accept only HS256.
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

  const session = verifyToken(token);
  if (!session) return null;

  // A valid signature is not the same as a session that should still exist.
  // Changing a password has to end whoever else was signed in — that is the
  // entire reason someone changes it when they think they have been
  // compromised — and a JWT cannot express that on its own.
  if (await isRevoked(session)) return null;

  return session;
}


/**
 * Whether this token's session version still matches the account's.
 *
 * COST: one indexed primary-key read per authenticated request. That is a real
 * addition to a path that was previously pure signature verification, and it
 * deserved thinking about rather than assuming. It is justified because the
 * alternative is a stolen session surviving the password change made
 * specifically to kill it, for up to seven days. Every route calling this
 * already runs several queries to render anything, so one keyed lookup is not
 * what will make this application slow.
 *
 * Fails OPEN on a database error: a transient outage must not sign the whole
 * studio out. It is logged rather than swallowed.
 */
async function isRevoked(session: AuthPayload | ClientAuthPayload): Promise<boolean> {
  const tokenVersion = session.sv ?? 0;

  try {
    const account =
      session.type === 'client'
        ? await prisma.client.findUnique({
            where: { id: session.clientId },
            select: { sessionVersion: true },
          })
        : await prisma.user.findUnique({
            where: { id: session.userId },
            select: { sessionVersion: true },
          });

    // The account is gone — so is the session.
    if (!account) return true;

    return account.sessionVersion !== tokenVersion;
  } catch (error) {
    console.error('[auth] revocation check failed, allowing session:', error);
    return false;
  }
}

/**
 * The current session version for an account, for minting a token.
 */
export async function currentSessionVersion(
  kind: 'user' | 'client',
  id: string
): Promise<number> {
  try {
    const account =
      kind === 'client'
        ? await prisma.client.findUnique({ where: { id }, select: { sessionVersion: true } })
        : await prisma.user.findUnique({ where: { id }, select: { sessionVersion: true } });
    return account?.sessionVersion ?? 0;
  } catch {
    return 0;
  }
}

/**
 * End every existing session for an account. Call this wherever a password
 * changes — reset, self-service change, or an admin setting a new one.
 */
export async function revokeSessions(
  kind: 'user' | 'client',
  id: string
): Promise<number> {
  const data = { sessionVersion: { increment: 1 } };

  const updated =
    kind === 'client'
      ? await prisma.client.update({ where: { id }, data, select: { sessionVersion: true } })
      : await prisma.user.update({ where: { id }, data, select: { sessionVersion: true } });

  return updated.sessionVersion;
}

/**
 * Generate a random password for new clients.
 *
 * Uses the crypto RNG, not `Math.random()`. `Math.random()` is a fast
 * non-cryptographic generator whose internal state can be recovered from a
 * handful of observed outputs — so a client who saw one generated password
 * could predict the next ones. These passwords are emailed to real clients and
 * protect real project data, so they need real randomness.
 *
 * `randomInt` is used rather than a modulo of random bytes because modulo
 * introduces a slight bias toward the earlier characters of the alphabet;
 * `randomInt` rejects and re-rolls to keep the distribution uniform.
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
