import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createToken, verifyToken, generateRandomPassword } from '@/lib/auth';

/**
 * Salvaged from claude/close-admin-signup-hole. The half of that file about
 * where the secret comes from is already covered by env-secrets.test.ts —
 * and asserted the opposite of what main does, since that branch still had a
 * per-process dev fallback and main now refuses to boot without a real
 * secret. What is kept is the half about what the token itself is worth.
 *
 * These are the session cookies for the whole CRM. A token this app accepts
 * is an owner account: every lead, contract, invoice and payment.
 */

const GOOD_SECRET = 'x'.repeat(48);

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', GOOD_SECRET);
});

describe('round-tripping a real session', () => {
  it('signs and verifies a staff session', () => {
    const token = createToken({ userId: 'u1', email: 'a@b.com', role: 'owner', type: 'user' });

    expect(verifyToken(token)).toMatchObject({ userId: 'u1', role: 'owner', type: 'user' });
  });

  it('signs and verifies a client session', () => {
    const token = createToken({ clientId: 'c1', email: 'a@b.com', type: 'client' });

    expect(verifyToken(token)).toMatchObject({ clientId: 'c1', type: 'client' });
  });
});

describe('tokens it must refuse', () => {
  it('rejects one signed with a different key', () => {
    const forged = jwt.sign({ userId: 'u1', type: 'user' }, 'y'.repeat(48));

    expect(verifyToken(forged)).toBeNull();
  });

  it('rejects garbage by returning null, not by throwing', () => {
    // Callers treat null as "not signed in". A throw here would surface as a
    // 500 on every route that reads a cookie, which is a worse day than a
    // redirect to the login page.
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ userId: 'u1', type: 'user' }, GOOD_SECRET, { expiresIn: '-1s' });

    expect(verifyToken(expired)).toBeNull();
  });

  it('rejects an unsigned "alg: none" token claiming to be the owner', () => {
    // The classic algorithm-confusion attack: strip the signature and declare
    // the token needs none. Anyone could mint this one — it is just base64.
    // Pinning the algorithm on verify is what stops it.
    const unsigned = jwt.sign({ userId: 'attacker', role: 'owner', type: 'user' }, '', {
      algorithm: 'none',
    });

    expect(verifyToken(unsigned)).toBeNull();
  });

  it('rejects a token signed with an algorithm we do not use', () => {
    // Belt and braces on the same pin: HS512 is a perfectly real signature,
    // just not ours, and accepting whatever the header asks for is how
    // confusion attacks start.
    const wrongAlg = jwt.sign({ userId: 'u1', type: 'user' }, GOOD_SECRET, {
      algorithm: 'HS512',
    });

    expect(verifyToken(wrongAlg)).toBeNull();
  });
});

describe('the passwords we generate for clients', () => {
  // These are emailed in plaintext and, in practice, never changed — they are
  // permanent credentials guarding real project data.

  it('is long enough to be worth guarding', () => {
    expect(generateRandomPassword()).toHaveLength(20);
  });

  it('does not repeat across calls', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRandomPassword()));

    expect(seen.size).toBe(200);
  });

  it('does not use Math.random, whose state is recoverable from its output', () => {
    // Two clients onboarded from the same warm serverless instance would
    // otherwise have had related passwords.
    const spy = vi.spyOn(Math, 'random');

    generateRandomPassword();

    expect(spy).not.toHaveBeenCalled();
  });

  it('draws on the whole alphabet rather than a biased slice', () => {
    const chars = new Set(
      Array.from({ length: 300 }, () => generateRandomPassword()).join('')
    );

    // 66-character alphabet; a modulo-biased generator would visibly skew.
    expect(chars.size).toBeGreaterThan(60);
  });

  it('avoids the characters people misread off a screen', () => {
    // These get read out of an email and typed by hand. 0/O and 1/l/I are
    // the support ticket.
    const sample = Array.from({ length: 300 }, () => generateRandomPassword()).join('');

    for (const ambiguous of ['0', 'O', '1', 'l', 'I', 'o']) {
      expect(sample, ambiguous).not.toContain(ambiguous);
    }
  });
});
