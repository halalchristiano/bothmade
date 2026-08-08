import { afterEach, vi } from 'vitest';

/**
 * Put global state back the way it was found, after every single test.
 *
 * Vitest isolates test *files* from each other, so a stub in one file cannot
 * reach another. What it does not isolate is one `it()` from the next inside
 * the same file — and that is where this bites, because it is invisible.
 * A test that mocks `Math.random`, spies on `console.error` or stubs an env
 * var leaves it in place for every test after it in the file. The suite still
 * passes, so nothing complains. It goes wrong later and somewhere else:
 *
 *   - The leaked value happens to be what the next test wanted, so that test
 *     passes for a reason it never states and would fail on its own.
 *   - Or `--sequence.shuffle` reorders the file and a test that has passed
 *     for months fails on a Tuesday with no change to explain it. This repo
 *     has already lost time to exactly that — see the commit about a
 *     copy-button test leaking a global.
 *
 * Both halves of the suite were exposed, in different ways:
 *
 *   lib         had no setupFiles at all, so nothing was restored — spies,
 *               env stubs and globals all survived to the next test. About
 *               twenty files use `vi.spyOn` or `vi.stubEnv` without cleaning
 *               up, which was safe only by luck and by careful `beforeEach`
 *               re-stubbing in the files that thought about it.
 *   components  restored mocks but not env or globals, so `vi.stubEnv` and
 *               `vi.stubGlobal` leaked.
 *
 * Shared by both projects rather than written twice, so the two cannot drift
 * — which is how the gap opened in the first place. tests/setup.ts imports
 * this and then adds the DOM-only pieces on top.
 *
 * Note this runs *after* each test's own `afterEach`, since those register
 * first. A test that cleans up after itself is unaffected; this is the floor,
 * not a replacement.
 */
afterEach(() => {
  // Undoes vi.spyOn and vi.fn mock implementations, restoring originals.
  vi.restoreAllMocks();
  // vi.stubEnv — not covered by restoreAllMocks.
  vi.unstubAllEnvs();
  // vi.stubGlobal — likewise.
  vi.unstubAllGlobals();
});
