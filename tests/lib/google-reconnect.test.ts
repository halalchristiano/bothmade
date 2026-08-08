import { describe, expect, it } from 'vitest';
import { needsGoogleReconnect } from '@/lib/gmail-oauth';

/**
 * Whether a failed Gmail read means "go and re-authorise" or "try later".
 *
 * The answer is written to `gmailNeedsReconnect`, which is what puts a rep
 * through the Google sign-in again — so it is worth being right in both
 * directions, and the rule it replaces
 * (`/insufficient|scope|forbidden|403/i` against the message string) was
 * wrong at both ends.
 *
 * It missed every revocation. `invalid_grant` is what Google answers once
 * somebody removes the app from their account or the refresh token goes
 * stale, and it is the likeliest reason reading stops working at all. The
 * flag stayed clear, the settings page stayed quiet, and the string
 * "invalid_grant" was handed to a human as the explanation.
 *
 * And it flagged quota failures. Gmail returns 403 for insufficient
 * permissions AND for userRateLimitExceeded, rateLimitExceeded and
 * quotaExceeded — so the nightly batch tripping a limit would have told the
 * studio their connection was broken and sent them to re-authorise something
 * that was working.
 */

/** The shape googleapis actually throws. */
const gaxios = (message: string, code?: number, reason?: string) =>
  Object.assign(new Error(message), {
    code,
    errors: reason ? [{ reason, message }] : undefined,
  });

describe('a connection that has to be re-authorised', () => {
  it('catches a revoked or stale refresh token', () => {
    // The one that was missed. Nothing in the old pattern matched this.
    expect(needsGoogleReconnect(gaxios('invalid_grant', 400))).toBe(true);
    expect(needsGoogleReconnect(new Error('invalid_grant: Token has been expired or revoked.'))).toBe(true);
  });

  it('catches a token the API will not accept', () => {
    expect(needsGoogleReconnect(gaxios('Invalid Credentials', 401, 'authError'))).toBe(true);
    expect(needsGoogleReconnect(new Error('invalid_token'))).toBe(true);
    expect(needsGoogleReconnect(new Error('unauthorized_client'))).toBe(true);
  });

  it('catches a token that predates the read scope, which is what this began as', () => {
    expect(
      needsGoogleReconnect(gaxios('Request had insufficient authentication scopes.', 403, 'insufficientPermissions'))
    ).toBe(true);
    expect(needsGoogleReconnect(new Error('Forbidden'))).toBe(true);
  });

  it('reads the status even when the message says nothing useful', () => {
    expect(needsGoogleReconnect(Object.assign(new Error('Request failed'), { code: 403 }))).toBe(true);
    expect(needsGoogleReconnect(Object.assign(new Error('Request failed'), { status: 401 }))).toBe(true);
  });
});

describe('a bad minute, which is not a reconnect', () => {
  it('never sends somebody to re-authorise over a quota', () => {
    // Gmail answers these with 403, the same status as a scope failure, so
    // the reason has to win over the status.
    for (const reason of ['userRateLimitExceeded', 'rateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded']) {
      expect(needsGoogleReconnect(gaxios('Quota exceeded for quota metric.', 403, reason)), reason).toBe(false);
    }
  });

  it('leaves a 429 alone', () => {
    expect(needsGoogleReconnect(gaxios('Too Many Requests', 429))).toBe(false);
  });

  it('leaves the network and the server alone', () => {
    expect(needsGoogleReconnect(new Error('read ECONNRESET'))).toBe(false);
    expect(needsGoogleReconnect(new Error('getaddrinfo ENOTFOUND gmail.googleapis.com'))).toBe(false);
    expect(needsGoogleReconnect(gaxios('Internal error encountered.', 500))).toBe(false);
    expect(needsGoogleReconnect(gaxios('Service Unavailable', 503))).toBe(false);
  });

  it('is not fooled by a number that merely looks like a status', () => {
    // The old rule tested for `403` anywhere in the string.
    expect(needsGoogleReconnect(new Error('socket hang up after 4031 bytes'))).toBe(false);
    expect(needsGoogleReconnect(new Error('timeout of 40300ms exceeded'))).toBe(false);
  });

  it('says nothing about an absent error', () => {
    expect(needsGoogleReconnect(null)).toBe(false);
    expect(needsGoogleReconnect(undefined)).toBe(false);
    expect(needsGoogleReconnect('')).toBe(false);
  });
});
