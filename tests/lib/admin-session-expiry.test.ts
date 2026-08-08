import { describe, expect, it, vi } from 'vitest';
import { ADMIN_LOGIN, isSessionExpired, redirectIfSessionExpired } from '@/lib/admin-session-expiry';

/**
 * What four admin pages did instead of noticing they were signed out.
 *
 * A 401 from the proxy carries a JSON body, so `res.json()` resolves happily
 * with `{ error: 'Unauthorized' }` — and each of them read it as data rather
 * than as a session that had run out:
 *
 *   /admin/settings  set that object as the Gmail status, so `connected` was
 *                    undefined and the page stated the studio's mailbox was
 *                    not set up, with a button offering to connect it.
 *   /admin/team      "Could not load the team." on the one screen that can
 *                    put an account back.
 *   /admin/billing   an empty ledger, indistinguishable from a quiet month.
 *   /admin/projects/new  a scope somebody had just typed out, refused with
 *                    "Unauthorized" as though the project were the problem.
 *
 * The rest of the admin has always redirected. This is the check they share.
 */

describe('a response that means "you are signed out"', () => {
  it('recognises a 401', () => {
    expect(isSessionExpired({ status: 401 })).toBe(true);
  });

  it('recognises a 403, which is the same dead end from a staff page', () => {
    expect(isSessionExpired({ status: 403 })).toBe(true);
  });

  it('leaves an ordinary failure alone', () => {
    // A 500 is a thing to report, not a thing to log in again over.
    for (const status of [200, 201, 400, 404, 409, 429, 500, 502, 503]) {
      expect(isSessionExpired({ status }), String(status)).toBe(false);
    }
  });
});

describe('what the page does about it', () => {
  it('sends them to the login page and says it handled it', () => {
    const push = vi.fn();

    expect(redirectIfSessionExpired({ status: 401 }, push)).toBe(true);
    expect(push).toHaveBeenCalledWith(ADMIN_LOGIN);
  });

  it('sends staff to the admin login, not the client one', () => {
    // /client/login is a different door, and a rep who lands there cannot
    // get in with the account they have.
    expect(ADMIN_LOGIN).toBe('/admin/login');
  });

  it('does nothing and says so for a response that loaded', () => {
    const push = vi.fn();

    expect(redirectIfSessionExpired({ status: 200 }, push)).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('does not redirect over a server error, which would hide it', () => {
    const push = vi.fn();

    expect(redirectIfSessionExpired({ status: 500 }, push)).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('returns true so the caller can stop before parsing an error body', () => {
    // The whole point: `if (redirectIfSessionExpired(res, push)) return;`
    // The page must not go on to read `{ error: 'Unauthorized' }` as state.
    const push = vi.fn();
    let parsed = false;

    if (!redirectIfSessionExpired({ status: 401 }, push)) parsed = true;

    expect(parsed).toBe(false);
  });
});
