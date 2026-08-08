import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every handler under /api/admin checks who is calling.
 *
 * There are 99 route files under that tree and they are added a few a week.
 * Nothing anywhere asserted that a new one is guarded — each route carried its
 * own `requireStaff()` by convention, and a convention with no test is a thing
 * that holds until the day somebody is in a hurry. The failure is silent in
 * exactly the wrong way: an unguarded admin route works perfectly for the
 * person who wrote it, because they are signed in.
 *
 * ## Why proxy.ts isn't the answer
 *
 * The proxy does 403 a client session on the whole /api/admin namespace, and
 * that is real defence in depth. It is not the check being made here, for two
 * reasons. It answers "is this a staff cookie", not "which staff member, and
 * is the account still allowed" — `requireStaff` re-reads the row to honour
 * `sessionsValidFrom`, which is what makes a password change actually evict a
 * stolen session, and re-reads `role`, which is what makes a demotion take
 * effect before the token ages out a week later. And it leaves `session.userId`
 * undefined, so a route that skips the guard has nobody to attribute the write
 * to even when the caller is legitimate.
 *
 * ## Per handler, not per file
 *
 * The check is scoped to each exported handler rather than to the file. A
 * file-level grep passes a route whose GET is guarded and whose newly added
 * POST is not, which is the more likely mistake of the two: the guard is
 * already imported at the top and already used further down, so nothing looks
 * missing.
 */

const ADMIN_ROUTES = 'app/api/admin';

/** The guards that establish a staff identity. Any one of them satisfies this. */
const GUARDS = ['requireStaff', 'requireOwner', 'requirePrincipal'];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Routes that legitimately have no session guard, each with the thing it uses
 * instead.
 *
 * An allowlist that only names files is a hole with a comment on it, so each
 * entry also names the check that replaces the guard, and the test asserts
 * that check is present. Adding a genuinely unguarded route here fails.
 */
const INSTEAD_OF_A_SESSION: Record<string, { instead: string; why: string }> = {
  'settings/gmail-oauth/callback/route.ts': {
    instead: 'verifyOAuthState',
    why:
      "Google redirects the browser here, so there is no session to require — the " +
      'caller is Google, not a signed-in person. The capability is the `state` ' +
      'parameter, which lib/auth.ts signs with the server secret and expires in ten ' +
      'minutes, and which carries the userId the callback attributes the connection ' +
      'to. An unsigned or stale state is redirected away with `reason=invalid-state`.',
  },
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('route.ts') ? [full] : [];
  });

/**
 * Split a route file into one slice per exported handler.
 *
 * Deliberately not brace-matching: a `}` inside a template literal or a regex
 * would desynchronise the count and hand back a slice that silently contains
 * the wrong half of the file. Cutting at the next handler's export is coarser
 * and cannot go wrong that way. A helper defined between two handlers counts
 * towards the one above it, which is the right answer anyway — that is usually
 * a function the handler above just called.
 */
function handlerSlices(src: string): Array<{ method: string; body: string }> {
  const found = HTTP_METHODS.flatMap((method) => {
    const re = new RegExp(`export\\s+(?:async\\s+function|function|const)\\s+${method}\\b`);
    const at = src.search(re);
    return at === -1 ? [] : [{ method, at }];
  }).sort((a, b) => a.at - b.at);

  return found.map(({ method, at }, i) => ({
    method,
    body: src.slice(at, i + 1 < found.length ? found[i + 1].at : src.length),
  }));
}

const routes = walk(ADMIN_ROUTES);

describe('every admin API handler', () => {
  it('found the route tree — a glob that matches nothing would pass everything', () => {
    // Without this the whole suite is vacuous if the directory is ever moved:
    // zero routes iterated is zero failures.
    expect(routes.length).toBeGreaterThan(90);
  });

  it('exports at least one HTTP handler per route file', () => {
    const empty = routes.filter((f) => handlerSlices(readFileSync(f, 'utf8')).length === 0);

    // Also a self-check on the slicer: if it stopped recognising the export
    // shape this repo uses, every handler below would be trivially "guarded"
    // because none would be looked at.
    expect(empty, `no HTTP handler found in:\n${empty.join('\n')}`).toEqual([]);
  });

  it('establishes who is calling before doing anything', () => {
    const unguarded: string[] = [];

    for (const file of routes) {
      const rel = file.slice(ADMIN_ROUTES.length + 1);
      if (rel in INSTEAD_OF_A_SESSION) continue;

      const src = readFileSync(file, 'utf8');
      for (const { method, body } of handlerSlices(src)) {
        if (!GUARDS.some((g) => body.includes(g))) unguarded.push(`${method} ${file}`);
      }
    }

    expect(
      unguarded,
      `these admin handlers call none of ${GUARDS.join(', ')}:\n${unguarded.join('\n')}\n\n` +
        'If one genuinely cannot use a session, add it to INSTEAD_OF_A_SESSION ' +
        'with the check it uses in its place.'
    ).toEqual([]);
  });
});

describe('the routes that cannot use a session', () => {
  it('is a short list, and stays one', () => {
    // A growing allowlist is the way this test stops meaning anything, so the
    // count is pinned rather than left open. Raising it should take an
    // argument, not a keystroke.
    expect(Object.keys(INSTEAD_OF_A_SESSION)).toHaveLength(1);
  });

  it('each still proves the caller some other way', () => {
    for (const [rel, { instead, why }] of Object.entries(INSTEAD_OF_A_SESSION)) {
      const src = readFileSync(join(ADMIN_ROUTES, rel), 'utf8');

      expect(src, `${rel} is allowlisted but does not call ${instead}`).toContain(instead);
      expect(why.length, `${rel} needs a reason, not an entry`).toBeGreaterThan(80);
    }
  });

  /**
   * And the replacement is real: the OAuth state is a signature, not a
   * parameter somebody can type. If `verifyOAuthState` ever stops verifying,
   * the allowlist above is quietly pointing at an open door.
   */
  it('signs and expires the OAuth state it trusts instead of a session', () => {
    const auth = readFileSync('lib/auth.ts', 'utf8');
    const at = auth.indexOf('export function verifyOAuthState');
    expect(at, 'verifyOAuthState is gone — the gmail callback has no guard left').toBeGreaterThan(-1);

    const body = auth.slice(at, at + 500);
    expect(body, 'the state is no longer signature-checked').toMatch(/jwt\.verify/);
    expect(body, 'a state for another purpose would be accepted').toMatch(/purpose/);

    const mint = auth.slice(auth.indexOf('export function createOAuthState'));
    expect(mint.slice(0, 400), 'the state no longer expires').toMatch(/expiresIn/);
  });
});
