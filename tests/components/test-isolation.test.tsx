import { describe, expect, it, vi } from 'vitest';

/**
 * A canary for tests/setup-state.ts.
 *
 * Everything that file protects against is silent: a leaked spy or env stub
 * makes the suite pass, not fail. So if the setup were dropped from
 * vitest.config.mts — or the `lib` project were rewritten and the setupFiles
 * line lost, which is precisely how the gap opened — nothing would say so.
 * The whole suite would keep passing, and the cost would arrive weeks later
 * as a shuffle failure with no change to blame.
 *
 * These tests are the exception. They deliberately leak, and then check the
 * leak was cleaned up, so removing the cleanup fails here immediately with a
 * message naming the thing that broke.
 *
 * They depend on running in order, which vitest does within a file by
 * default. Under `--sequence.shuffle` the pair may run either way round; both
 * orders pass when cleanup works, because a "leak" test asserts only its own
 * effect and the "clean" test asserts a state that is correct before anything
 * has run as well as after.
 */

const CANARY = '__isolation_canary__';

describe('state does not leak from one test to the next', () => {
  it('leaves a mocked Math.random, a stubbed env var and a stubbed global behind', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
    vi.stubEnv(CANARY, 'leaked');
    vi.stubGlobal(CANARY, 'leaked');

    // Sanity: the leak is real, so the next test is a genuine check.
    expect(Math.random()).toBe(0.42);
    expect(process.env[CANARY]).toBe('leaked');
    expect((globalThis as Record<string, unknown>)[CANARY]).toBe('leaked');
  });

  it('starts clean anyway', () => {
    expect(
      Math.random(),
      'Math.random is still mocked — tests/setup.ts is not running for the components project'
    ).not.toBe(0.42);

    expect(
      process.env[CANARY],
      'a vi.stubEnv survived — vi.unstubAllEnvs() is not running'
    ).toBeUndefined();

    expect(
      (globalThis as Record<string, unknown>)[CANARY],
      'a vi.stubGlobal survived — vi.unstubAllGlobals() is not running'
    ).toBeUndefined();
  });
});
