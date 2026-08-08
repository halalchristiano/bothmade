/**
 * What an admin page does when its session has run out.
 *
 * Most of the admin already knows: the call cockpit, the clients list, the
 * team chat all check for a 401 and send the person to /admin/login. Four
 * pages did not, and they did not fail neutrally — a 401 carries a JSON body,
 * so `res.json()` resolves happily with `{ error: 'Unauthorized' }` and each
 * page read it as data:
 *
 *   /admin/settings   `setStatus({ error: 'Unauthorized' })`, so `connected`
 *                     is undefined and the page states that the studio's
 *                     Gmail is not connected, with a button offering to set
 *                     it up. It is not disconnected. Nobody is signed in.
 *   /admin/team       "Could not load the team." — a page that looks broken,
 *                     on the one screen that can add an account back.
 *   /admin/billing    an empty ledger, which is the same shape as a quiet
 *                     month.
 *   /admin/projects/new  a form that will refuse to save and not say why.
 *
 * Telling somebody a thing is broken when in fact they are signed out is the
 * worst of both: they cannot fix what they are being shown, and the fix they
 * need is not on the screen. The session simply expiring is the ordinary
 * case — these are seven-day tokens on a page people leave open.
 */

/** The path a signed-out staff member belongs on. */
export const ADMIN_LOGIN = '/admin/login';

/**
 * True when this response means "you are not signed in" rather than "that
 * went wrong". 403 counts: the proxy answers it for a session whose audience
 * is wrong, which from a staff page is the same dead end.
 */
export function isSessionExpired(res: { status: number }): boolean {
  return res.status === 401 || res.status === 403;
}

/**
 * Sends them to the login page if the session is gone, and reports whether it
 * did — so a caller can stop rather than carry on parsing a body that is an
 * error message.
 *
 *   const res = await fetch('/api/admin/…');
 *   if (redirectIfSessionExpired(res, router.push)) return;
 *
 * `push` is passed in rather than imported: this is called from client
 * components that already hold a router, and a module that reaches for one
 * itself cannot be tested without a Next runtime around it.
 */
export function redirectIfSessionExpired(
  res: { status: number },
  push: (href: string) => void
): boolean {
  if (!isSessionExpired(res)) return false;
  push(ADMIN_LOGIN);
  return true;
}
