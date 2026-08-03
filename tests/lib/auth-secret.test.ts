import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * The signing key used to fall back to the literal string 'your-secret-key'
 * when JWT_SECRET was unset. That string is in this repository, so any deploy
 * missing the variable would have verified a token anybody could mint —
 * including one claiming `role: 'owner'`. These tests are the guard rail.
 */

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const { createToken, verifyToken, generateRandomPassword, __resetJwtSecretCache } = await import(
  '@/lib/auth'
);

const GOOD_SECRET = 'x'.repeat(48);

beforeEach(() => {
  __resetJwtSecretCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetJwtSecretCache();
});

describe('the published fallback secret', () => {
  it('is gone — a token signed with it is not accepted', () => {
    vi.stubEnv('JWT_SECRET', GOOD_SECRET);

    const forged = jwt.sign({ userId: 'attacker', email: 'a@b.com', role: 'owner', type: 'user' }, 'your-secret-key');

    expect(verifyToken(forged)).toBeNull();
  });

  it('refuses to sign in production when the secret is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');

    // Refusing to issue sessions is bad; issuing them under a key that is
    // public knowledge is very much worse.
    expect(() => createToken({ userId: 'u1', email: 'a@b.com', type: 'user' })).toThrow(/JWT_SECRET/);
  });

  it('refuses a secret too short to be worth having', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'short');

    expect(() => createToken({ userId: 'u1', email: 'a@b.com', type: 'user' })).toThrow(/at least 32/);
  });

  it('says how to fix it, so nobody has to guess', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');

    expect(() => createToken({ userId: 'u1', email: 'a@b.com', type: 'user' })).toThrow(/openssl rand/);
  });

  it('falls back to a throwaway per-process key outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '');

    const token = createToken({ userId: 'u1', email: 'a@b.com', type: 'user' });

    expect(verifyToken(token)).toMatchObject({ userId: 'u1' });
    // ...and that key must not be the published one.
    expect(jwt.verify.bind(null, token, 'your-secret-key')).toThrow();
  });
});

describe('round-tripping a real session', () => {
  beforeEach(() => vi.stubEnv('JWT_SECRET', GOOD_SECRET));

  it('signs and verifies a staff session', () => {
    const token = createToken({ userId: 'u1', email: 'a@b.com', role: 'owner', type: 'user' });
    expect(verifyToken(token)).toMatchObject({ userId: 'u1', role: 'owner', type: 'user' });
  });

  it('signs and verifies a client session', () => {
    const token = createToken({ clientId: 'c1', email: 'a@b.com', type: 'client' });
    expect(verifyToken(token)).toMatchObject({ clientId: 'c1', type: 'client' });
  });

  it('rejects a token signed with a different key', () => {
    const other = jwt.sign({ userId: 'u1', type: 'user' }, 'y'.repeat(48));
    expect(verifyToken(other)).toBeNull();
  });

  it('rejects garbage instead of throwing', () => {
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ userId: 'u1', type: 'user' }, GOOD_SECRET, { expiresIn: '-1s' });
    expect(verifyToken(expired)).toBeNull();
  });

  it('rejects an unsigned "alg: none" token', () => {
    // The classic algorithm-confusion attack: strip the signature and declare
    // the token needs none. Pinning algorithms is what stops it.
    const unsigned = jwt.sign({ userId: 'attacker', role: 'owner', type: 'user' }, '', {
      algorithm: 'none',
    });

    expect(verifyToken(unsigned)).toBeNull();
  });
});

describe('generateRandomPassword', () => {
  it('is 16 characters', () => {
    expect(generateRandomPassword()).toHaveLength(16);
  });

  it('does not repeat across calls', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRandomPassword()));
    expect(seen.size).toBe(200);
  });

  it('does not use Math.random, whose state is recoverable from its output', () => {
    const spy = vi.spyOn(Math, 'random');
    generateRandomPassword();
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws on the whole alphabet rather than a biased slice', () => {
    const chars = new Set(Array.from({ length: 300 }, () => generateRandomPassword()).join(''));
    // 70-character alphabet; a modulo-biased generator would visibly skew.
    expect(chars.size).toBeGreaterThan(60);
  });
});
