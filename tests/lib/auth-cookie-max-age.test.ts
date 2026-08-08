import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthCookieMaxAge } from '@/lib/auth';

/**
 * How long a login lasts, and the unit trap in the way of getting it right.
 *
 * This was `parseInt(process.env.AUTH_COOKIE_MAX_AGE || '604800')`. parseInt
 * reads as far as it understands and then stops, silently, so every natural
 * way of writing a duration parses to something — and every one of them is
 * wrong. `.env.example` offered the override without saying the unit was
 * seconds, which is the other half of the trap.
 *
 * "7d" is the one that matters. Seven seconds is not a broken setting from
 * the outside, it is a broken *login*: the password is accepted, the redirect
 * happens, and the next page load is back at the login screen. On every
 * device, for everyone, with nothing in any log, because nothing threw.
 * Somebody would spend a day on that.
 */

const DEFAULT = 604800; // 7 days

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function withValue(value: string | undefined) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  if (value === undefined) vi.stubEnv('AUTH_COOKIE_MAX_AGE', '');
  else vi.stubEnv('AUTH_COOKIE_MAX_AGE', value);
  return resolveAuthCookieMaxAge();
}

describe('when it is not set', () => {
  it('lasts seven days', () => {
    expect(withValue(undefined)).toBe(DEFAULT);
  });

  it('treats whitespace as unset rather than as a number', () => {
    // parseInt('  ') is NaN, which produced an invalid Max-Age and a cookie
    // the browser discarded outright.
    expect(withValue('   ')).toBe(DEFAULT);
  });
});

describe('when it is a plain number of seconds', () => {
  it('uses it', () => {
    expect(withValue('2592000')).toBe(2592000); // 30 days
  });

  it('accepts a short but legitimate session', () => {
    expect(withValue('3600')).toBe(3600);
  });

  it('tolerates surrounding whitespace from a copied .env line', () => {
    expect(withValue('  86400  ')).toBe(86400);
  });
});

describe('the ways somebody writes a duration that used to silently work', () => {
  it.each([
    ['7d', 'seven seconds — a login that appears to work and does not'],
    ['2 weeks', 'two seconds'],
    ['1e5', 'one second, because parseInt stops at the e'],
    ['7 days', 'seven seconds'],
    ['0x10', 'sixteen, via a hex literal nobody meant'],
  ])('refuses %s (%s) and falls back to seven days', (value) => {
    expect(withValue(value)).toBe(DEFAULT);
  });

  it('refuses a value that is not a number at all', () => {
    expect(withValue('abc')).toBe(DEFAULT);
  });

  it('refuses zero and negatives, which expire the cookie immediately', () => {
    expect(withValue('0')).toBe(DEFAULT);
    expect(withValue('-1')).toBe(DEFAULT);
  });

  it('refuses a decimal rather than truncating it', () => {
    // Max-Age must be an integer; 3600.5 is somebody thinking in a different
    // unit again, so it is worth a line in the log rather than a silent floor.
    expect(withValue('3600.5')).toBe(DEFAULT);
  });
});

describe('the log line, which is the whole point of refusing', () => {
  it('names the value, the unit, and what was used instead', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('AUTH_COOKIE_MAX_AGE', '7d');

    resolveAuthCookieMaxAge();

    const message = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('7d');
    expect(message).toContain('SECONDS');
    expect(message).toContain(String(DEFAULT));
  });

  it('says nothing when the value is fine', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('AUTH_COOKIE_MAX_AGE', '604800');

    resolveAuthCookieMaxAge();

    expect(spy).not.toHaveBeenCalled();
  });
});
