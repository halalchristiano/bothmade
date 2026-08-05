import { describe, expect, it } from 'vitest';
import { CANONICAL_SITE_URL, resolveSiteUrl } from '@/lib/site-url';

/**
 * Seventeen call sites build client-facing links off this — a care-plan
 * offer, a mockup, a payment link, a password reset. One wrong value put the
 * wrong domain in front of every customer at once, silently, which is exactly
 * what happened: production was serving care links on bothmade.vercel.app.
 */

describe('in production', () => {
  it('refuses a deployment host and uses the studio domain', () => {
    expect(resolveSiteUrl('https://bothmade.vercel.app', 'production')).toBe(CANONICAL_SITE_URL);
    expect(resolveSiteUrl('https://bothmade-git-main-x.vercel.app', 'production')).toBe(CANONICAL_SITE_URL);
    expect(resolveSiteUrl('https://something.netlify.app', 'production')).toBe(CANONICAL_SITE_URL);
  });

  it('never lets localhost into a customer link', () => {
    expect(resolveSiteUrl(undefined, 'production')).toBe(CANONICAL_SITE_URL);
    expect(resolveSiteUrl('', 'production')).toBe(CANONICAL_SITE_URL);
    expect(resolveSiteUrl('   ', 'production')).toBe(CANONICAL_SITE_URL);
  });

  it('falls back rather than emitting something that is not a URL', () => {
    expect(resolveSiteUrl('bothmade.studio', 'production')).toBe(CANONICAL_SITE_URL);
    expect(resolveSiteUrl('not a url', 'production')).toBe(CANONICAL_SITE_URL);
  });

  it('honours a real custom domain', () => {
    expect(resolveSiteUrl('https://www.bothmade.studio', 'production')).toBe('https://www.bothmade.studio');
    expect(resolveSiteUrl('https://bothmade.studio', 'production')).toBe('https://bothmade.studio');
  });

  /** `${base}/care/${token}` on a trailing slash gives a double slash, and
   *  some mail clients treat that as a different link. */
  it('strips a trailing slash so appended paths do not double up', () => {
    expect(resolveSiteUrl('https://www.bothmade.studio/', 'production')).toBe('https://www.bothmade.studio');
    expect(resolveSiteUrl('https://www.bothmade.studio///', 'production')).toBe('https://www.bothmade.studio');
  });
});

describe('everywhere else', () => {
  it('leaves a preview deployment alone, because that is the point of one', () => {
    expect(resolveSiteUrl('https://bothmade-abc123.vercel.app', 'preview')).toBe(
      'https://bothmade-abc123.vercel.app'
    );
  });

  it('leaves a laptop alone', () => {
    expect(resolveSiteUrl('http://localhost:3000', 'development')).toBe('http://localhost:3000');
    expect(resolveSiteUrl(undefined, 'development')).toBe('http://localhost:3000');
  });

  it('leaves a tunnel or an IP alone', () => {
    expect(resolveSiteUrl('http://192.168.1.10:3000', 'development')).toBe('http://192.168.1.10:3000');
  });
});
