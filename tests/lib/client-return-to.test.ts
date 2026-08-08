import { describe, expect, it } from 'vitest';
import { loginWithReturn, safeReturnTo } from '@/lib/client-return-to';

/**
 * Finishing the journey a client started, without opening a redirect.
 *
 * They follow a link from an email to a project, the session has expired, and
 * the portal sends them to the login page — which then landed them on the
 * project list with no memory of what they clicked.
 *
 * The destination rides along as `?next=`. That is the same parameter that,
 * unvalidated, is how a login page on a real domain ends up bouncing people
 * to somebody else's: the link looks like ours right up to the moment it is
 * not. So every case below that is not plainly a path inside this portal goes
 * back to the list rather than being cleaned up and honoured.
 */

const HOME = '/client/projects';

describe('somewhere a client was actually going', () => {
  it('returns them to the project they clicked', () => {
    expect(safeReturnTo('/client/proj_123')).toBe('/client/proj_123');
  });

  it('keeps a query string, which is where a deep link carries its state', () => {
    expect(safeReturnTo('/client/proj_123?tab=invoices')).toBe('/client/proj_123?tab=invoices');
  });

  it('accepts it url-encoded, which is how it arrives', () => {
    expect(safeReturnTo(encodeURIComponent('/client/proj_123?tab=files'))).toBe(
      '/client/proj_123?tab=files'
    );
  });
});

describe('somewhere they are not going', () => {
  it('refuses another origin', () => {
    expect(safeReturnTo('https://evil.test/steal')).toBe(HOME);
  });

  it('refuses a protocol-relative URL, which is an origin wearing a path', () => {
    expect(safeReturnTo('//evil.test/steal')).toBe(HOME);
  });

  it('refuses backslashes, which some browsers read as slashes', () => {
    expect(safeReturnTo('/\\evil.test')).toBe(HOME);
    expect(safeReturnTo('/client/\\\\evil.test')).toBe(HOME);
  });

  it('refuses a path outside the client portal', () => {
    // A client has no business in the admin, and this must never be the thing
    // that sends them at it.
    expect(safeReturnTo('/admin/dashboard')).toBe(HOME);
    expect(safeReturnTo('/status/proj_1')).toBe(HOME);
  });

  it('refuses a prefix that only looks like the portal', () => {
    expect(safeReturnTo('/clientele/whatever')).toBe(HOME);
  });

  it('refuses the login page itself, which would loop', () => {
    expect(safeReturnTo('/client/login')).toBe(HOME);
    expect(safeReturnTo('/client/login?next=/client/login')).toBe(HOME);
  });

  it('falls back when there is nothing to read', () => {
    expect(safeReturnTo(null)).toBe(HOME);
    expect(safeReturnTo(undefined)).toBe(HOME);
    expect(safeReturnTo('')).toBe(HOME);
  });

  it('falls back rather than throwing on a malformed encoding', () => {
    expect(safeReturnTo('%E0%A4%A')).toBe(HOME);
  });
});

describe('the link a page builds on its way out', () => {
  it('carries the path and its query', () => {
    expect(loginWithReturn('/client/proj_9', '?tab=invoices')).toBe(
      `/client/login?next=${encodeURIComponent('/client/proj_9?tab=invoices')}`
    );
  });

  it('adds nothing when the destination is where login goes anyway', () => {
    // The list is the default landing place, so carrying it is noise in the
    // URL bar of a page a client is about to type a password into.
    expect(loginWithReturn('/client/projects', '')).toBe('/client/login');
  });

  it('adds nothing for a destination that would be refused', () => {
    // No point round-tripping something safeReturnTo will drop.
    expect(loginWithReturn('/admin/dashboard', '')).toBe('/client/login');
    expect(loginWithReturn('/client/login', '')).toBe('/client/login');
  });

  it('round-trips: what it builds is what comes back', () => {
    const built = loginWithReturn('/client/proj_9', '?tab=files');
    const next = new URLSearchParams(built.split('?')[1]).get('next');
    expect(safeReturnTo(next)).toBe('/client/proj_9?tab=files');
  });
});
