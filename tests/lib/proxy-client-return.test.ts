import { describe, expect, it, vi } from 'vitest';

/**
 * Where the gate sends a client whose cookie has run out.
 *
 * This is the ordinary way an expired session is discovered: not by a page
 * rendering and then getting a 401 back from its own fetch, but by the proxy
 * refusing the request before the page exists at all. A client follows a link
 * from an email to a project a week after we sent it, and the gate is what
 * meets them.
 *
 * It sent everyone to a bare /client/login, so the destination was gone
 * before the login page could have carried it — the client-side handling of a
 * 401 only ever covered the narrower case of a session that died mid-visit.
 */

vi.mock('@/lib/auth', () => ({ verifyToken: (t: string) => (t === 'good-client' ? { type: 'client' } : null) }));

const { proxy } = await import('@/proxy');
const { safeReturnTo } = await import('@/lib/client-return-to');

/** Only the parts of NextRequest the gate reads. */
const request = (url: string, cookie?: string) =>
  ({
    nextUrl: new URL(url),
    url,
    cookies: { get: (n: string) => (cookie && n === 'auth_token' ? { value: cookie } : undefined) },
  }) as never;

const locationOf = (res: Response) => {
  const raw = res.headers.get('location') as string;
  return new URL(raw, 'https://bothmade.co');
};

describe('a client sent to log in again', () => {
  it('carries the project they clicked', () => {
    const res = proxy(request('https://bothmade.co/client/proj_9'));
    const to = locationOf(res);

    expect(to.pathname).toBe('/client/login');
    expect(to.searchParams.get('next')).toBe('/client/proj_9');
  });

  it('carries the query string, which is where a deep link keeps its state', () => {
    const res = proxy(request('https://bothmade.co/client/proj_9?tab=invoices'));

    expect(locationOf(res).searchParams.get('next')).toBe('/client/proj_9?tab=invoices');
  });

  it('adds nothing when they were headed for the list anyway', () => {
    const res = proxy(request('https://bothmade.co/client/projects'));
    const to = locationOf(res);

    expect(to.pathname).toBe('/client/login');
    expect(to.search).toBe('');
  });

  it('stays on this origin no matter what the path looks like', () => {
    // The redirect target is built from the request's own pathname, and the
    // login page reads `next` back off it — so a path shaped like another
    // origin has to land on our login page and be refused there, not turn
    // into a hop off the site.
    for (const path of ['/client//evil.test/steal', '/client/%2F%2Fevil.test', '/client/\\evil.test']) {
      const to = locationOf(proxy(request(`https://bothmade.co${path}`)));

      expect(to.host).toBe('bothmade.co');
      expect(to.pathname).toBe('/client/login');
      // Whatever comes back out of `next` still resolves against this origin.
      const back = safeReturnTo(to.searchParams.get('next'));
      expect(new URL(back, 'https://bothmade.co').host).toBe('bothmade.co');
    }
  });
});

describe('what the gate still does', () => {
  it('lets a signed-in client through untouched', () => {
    const res = proxy(request('https://bothmade.co/client/proj_9', 'good-client'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('leaves the login page alone, so there is no loop', () => {
    const res = proxy(request('https://bothmade.co/client/login?next=%2Fclient%2Fproj_9'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('answers an unauthenticated API call with 401 rather than a redirect', () => {
    const res = proxy(request('https://bothmade.co/api/client/projects'));
    expect(res.status).toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });

  it('still sends staff to the admin login', () => {
    const res = proxy(request('https://bothmade.co/admin/dashboard'));
    expect(locationOf(res).pathname).toBe('/admin/login');
  });
});
