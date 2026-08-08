/**
 * Where a client was heading before their session ran out.
 *
 * They follow a link from an email to a project, the cookie has expired, and
 * every page in the portal answers that the same way: push them to
 * /client/login. Logging in then landed them on /client/projects — the list —
 * with no memory of what they had clicked. With one project that is a small
 * annoyance; with three it is a client hunting for the thing we just emailed
 * them about.
 *
 * The destination rides along as `?next=`, and comes back through here.
 *
 * Validated rather than trusted, because a login page that redirects to
 * whatever a query string says is an open redirect — the classic way a
 * phishing link borrows a real domain. Only a path, only inside the client
 * portal, and never the login page itself (which would loop).
 */

const HOME = '/client/projects';

export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return HOME;

  let value = raw;
  try {
    // A browser may hand this back encoded once or not at all.
    value = decodeURIComponent(raw);
  } catch {
    return HOME;
  }

  // Must be a path on this site. `//evil.test` is a protocol-relative URL and
  // a backslash is treated as a slash by some browsers, so both are refused
  // rather than normalised.
  if (!value.startsWith('/')) return HOME;
  if (value.startsWith('//') || value.startsWith('/\\')) return HOME;
  if (value.includes('\\')) return HOME;

  // Only the client portal. Nothing here should be able to send somebody into
  // the admin, and a client has no business there anyway.
  if (!value.startsWith('/client/')) return HOME;

  // Bouncing back to the login page would loop forever.
  if (value.startsWith('/client/login')) return HOME;

  return value;
}

/** The query string a page adds when it sends somebody off to log in. */
export function loginWithReturn(pathname: string, search = ''): string {
  const target = `${pathname}${search}`;
  if (safeReturnTo(target) === HOME) return '/client/login';
  return `/client/login?next=${encodeURIComponent(target)}`;
}
