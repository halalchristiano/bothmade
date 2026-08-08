import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import {
  SHARE_TOKEN_PARAM,
  buildCareOfferUrl,
  buildSignUrl,
  readShareToken,
  shareTokenMatches,
} from '@/lib/share-links';

/**
 * The capability tokens on the two links handed out with no login behind
 * them: a lead's sign-and-pay page and a project's public status page.
 *
 * This module had no tests of its own. Three of the things it deliberately
 * does were deleted one at a time and the whole suite stayed green:
 *
 *   - the constant-time comparison, replaced with `===`
 *   - the `x-share-token` header fallback, replaced with `null`
 *   - the trim on the token read off the query string
 *
 * The first is a security property the file's own header states as a
 * guarantee. The second and third are the difference between a client's link
 * working and a page that says "Not found" — a token pasted with a trailing
 * newline is what a URL wrapped by an email client looks like, and these
 * links travel by email.
 *
 * The same identifier that lets somebody read a proposal is the one that lets
 * them sign it, which is why this file exists at all.
 */

const TOKEN = 'a'.repeat(64);

afterEach(() => vi.restoreAllMocks());

describe('comparing a token', () => {
  it('accepts the exact token', () => {
    expect(shareTokenMatches(TOKEN, TOKEN)).toBe(true);
  });

  it('refuses a different one of the same length', () => {
    expect(shareTokenMatches(TOKEN, 'b'.repeat(64))).toBe(false);
  });

  it('refuses a prefix, without throwing on the length mismatch', () => {
    expect(shareTokenMatches(TOKEN, 'a'.repeat(63))).toBe(false);
    expect(shareTokenMatches(TOKEN, '')).toBe(false);
  });

  /**
   * An absent token must never satisfy an absent expectation. A row whose
   * token column somehow read empty would otherwise be readable by anyone who
   * omitted `?t=` entirely.
   */
  it('refuses when either side is missing', () => {
    expect(shareTokenMatches(null, TOKEN)).toBe(false);
    expect(shareTokenMatches(TOKEN, null)).toBe(false);
    expect(shareTokenMatches(undefined, undefined)).toBe(false);
    expect(shareTokenMatches('', '')).toBe(false);
  });

  /**
   * Asserting the call rather than the timing, deliberately.
   *
   * A timing property cannot be measured reliably in a test runner, and it is
   * invisible in review: `expected === provided` passes every behavioural test
   * in this file and reads like a simplification. The file's own header
   * promises constant time so response timing cannot be walked character by
   * character; this is the only thing standing between that promise and a
   * tidy-up that quietly removes it.
   */
  it('compares in constant time', () => {
    const spy = vi.spyOn(crypto, 'timingSafeEqual');
    shareTokenMatches(TOKEN, TOKEN);
    expect(spy, 'the comparison must not short-circuit on the first wrong byte').toHaveBeenCalled();
  });
});

describe('reading a token off a request', () => {
  const req = (url: string, headers?: Record<string, string>) => new Request(url, { headers });

  it('takes it from the query string', () => {
    expect(readShareToken(req(`https://x.test/status/p1?${SHARE_TOKEN_PARAM}=${TOKEN}`))).toBe(TOKEN);
  });

  /**
   * These links travel by email, and an email client that wraps a long URL
   * hands back a token with whitespace on the end. Without the trim the token
   * is a byte longer than the stored one, the length check refuses it, and the
   * client gets "Not found" on a link that is theirs and correct.
   */
  it('trims whitespace a mail client wrapped into the link', () => {
    expect(readShareToken(req(`https://x.test/status/p1?${SHARE_TOKEN_PARAM}=${TOKEN}%20`))).toBe(TOKEN);
    expect(readShareToken(req(`https://x.test/status/p1?${SHARE_TOKEN_PARAM}=%0A${TOKEN}%0A`))).toBe(TOKEN);
  });

  it('falls back to the header when there is no query string', () => {
    expect(readShareToken(req('https://x.test/status/p1', { 'x-share-token': TOKEN }))).toBe(TOKEN);
  });

  it('trims the header too', () => {
    expect(readShareToken(req('https://x.test/status/p1', { 'x-share-token': ` ${TOKEN} ` }))).toBe(TOKEN);
  });

  it('prefers the query string when both are present', () => {
    const r = req(`https://x.test/status/p1?${SHARE_TOKEN_PARAM}=${TOKEN}`, { 'x-share-token': 'b'.repeat(64) });
    expect(readShareToken(r)).toBe(TOKEN);
  });

  it('says nothing rather than empty when there is neither', () => {
    expect(readShareToken(req('https://x.test/status/p1'))).toBeNull();
    expect(readShareToken(req(`https://x.test/status/p1?${SHARE_TOKEN_PARAM}=`))).toBeNull();
  });
});

describe('the links we hand out', () => {
  it('carries the token on a sign-and-pay link', () => {
    const url = buildSignUrl('lead_1', TOKEN, 'https://bothmade.test');
    expect(url).toBe(`https://bothmade.test/sign/lead_1?${SHARE_TOKEN_PARAM}=${TOKEN}`);
    expect(readShareToken(new Request(url))).toBe(TOKEN);
  });

  /**
   * The care offer puts the token in the path rather than a query, because it
   * has no ID of its own worth addressing. Round-tripped here so the two
   * shapes cannot drift into each other.
   */
  it('puts the care-offer token in the path, not a query', () => {
    const url = buildCareOfferUrl(TOKEN, 'https://bothmade.test');
    expect(url).toContain(`/${TOKEN}`);
    expect(url).not.toContain(`${SHARE_TOKEN_PARAM}=`);
  });
});
