import { describe, expect, it } from 'vitest';

import { isTokenRevoked } from '@/lib/auth';

/**
 * Sessions are stateless 7-day JWTs, so "log everyone out" is a comparison
 * rather than a delete: each account carries a `sessionsValidFrom` watermark
 * and any token minted before it is refused.
 *
 * The case worth pinning is the same-second one. `iat` is in whole seconds
 * and floored, so a token minted milliseconds *after* a revocation can carry
 * an `iat` that reads as earlier than the watermark. Compared naively, the
 * person changing their password would be signed out by their own action —
 * in the one flow where that must not happen.
 */

/** A watermark at a known instant, plus its floored second. */
const WATERMARK = new Date('2026-08-03T12:00:00.400Z');
const WATERMARK_SECOND = Math.floor(WATERMARK.getTime() / 1000);

describe('isTokenRevoked', () => {
  it('allows everything when the account has never revoked', () => {
    expect(isTokenRevoked(WATERMARK_SECOND - 99999, null)).toBe(false);
    expect(isTokenRevoked(WATERMARK_SECOND - 99999, undefined)).toBe(false);
  });

  it('refuses a token minted before the watermark', () => {
    expect(isTokenRevoked(WATERMARK_SECOND - 1, WATERMARK)).toBe(true);
    expect(isTokenRevoked(WATERMARK_SECOND - 3600, WATERMARK)).toBe(true);
  });

  it('allows a token minted after the watermark', () => {
    expect(isTokenRevoked(WATERMARK_SECOND + 1, WATERMARK)).toBe(false);
  });

  it('allows a token minted in the same second as the revocation', () => {
    // The regression this guards: changing your password re-issues your
    // cookie, and that new token's floored `iat` equals the watermark's
    // second. A stricter comparison would log you out immediately.
    expect(isTokenRevoked(WATERMARK_SECOND, WATERMARK)).toBe(false);
  });

  it('refuses a token with no issued-at, which cannot be placed in time', () => {
    expect(isTokenRevoked(undefined, WATERMARK)).toBe(true);
  });

  it('still allows a token with no issued-at when nothing was ever revoked', () => {
    // Fail closed only where a revocation actually happened; otherwise this
    // would lock out every session the moment the field was introduced.
    expect(isTokenRevoked(undefined, null)).toBe(false);
  });
});

describe('isTokenRevoked — the flows that set the watermark', () => {
  it('evicts a session stolen before the password change', () => {
    // Attacker's token, minted an hour before the owner reacted.
    const stolenAt = WATERMARK_SECOND - 3600;
    const passwordChangedAt = WATERMARK;

    expect(isTokenRevoked(stolenAt, passwordChangedAt)).toBe(true);
  });

  it('keeps the session that performed the change', () => {
    // Re-issued immediately after the update, so its iat is >= the watermark.
    const reissuedAt = WATERMARK_SECOND + 1;

    expect(isTokenRevoked(reissuedAt, WATERMARK)).toBe(false);
  });
});
