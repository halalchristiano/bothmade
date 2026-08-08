import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    /*
     * 15s, not Vitest's 5s, and it applies to both projects below.
     *
     * A timeout is a budget, not an assertion — nothing in this suite claims
     * that a form submits or an email renders inside five seconds. But a
     * dozen tests sit between 1.1s and 2.1s of that budget on an idle
     * four-core box, for two separate and equally ordinary reasons: in
     * `components`, `user.type` fires one event per character into a page
     * that re-renders on each one, so filling three fields costs more than
     * everything else in its file; in `lib`, the first test in a file pays
     * the module-load cost of whatever it imports, which is over a second for
     * the mailer and the mockup templates.
     *
     * Comfortable at 25% of the budget, a coin toss at 300%. Running the
     * suite on a busy machine failed three tests, and a different three the
     * second time — `form-error-announcements`, then `mailer-plaintext`,
     * `mockups` and `send-guard`. Nothing was wrong with any of them. CI
     * runners are shared, and this is the exact shape of a test that passes
     * on a laptop and fails in the pipeline for no reason anybody can find,
     * which is how a suite stops being believed.
     *
     * 15s still stops a genuinely hung test from stalling the run.
     */
    testTimeout: 15_000,

    // Two environments, one command. Logic tests (pricing, contracts, CSV,
    // lead state) have no business paying for a DOM, and component tests
    // can't run without one.
    projects: [
      {
        extends: true,
        test: {
          name: 'lib',
          environment: 'node',
          include: ['tests/lib/**/*.test.ts'],
          // Restores spies and unstubs env/globals between tests. This
          // project had no setup file at all, so a vi.spyOn or vi.stubEnv
          // stayed in force for every test after it in the same file.
          setupFiles: ['./tests/setup-state.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['./tests/setup.ts'],

          /*
           * Vitest's default is 5s, which is sized for a fast unit test. These
           * are not: each one mounts a real React tree into jsdom and drives it
           * through userEvent, which dispatches a full event sequence per
           * keystroke and re-renders on every one. The slowest file spends
           * fifteen seconds on thirty tests, and several sit around a second.
           *
           * A second is comfortable against 5s right up until the machine is
           * busy, and then it is not. Reproduced by running two other vitest
           * processes alongside this project: three files failed with "Test
           * timed out in 5000ms" — ContactForm, blog-anchors-and-schema and
           * form-error-announcements — none of which is slow enough to be
           * suspicious on an idle machine. That is exactly the shape of CI:
           * a shared GitHub runner, and since the Build and shuffled-test steps
           * were added, this suite runs twice per push.
           *
           * A test that fails only when the runner is busy is worse than a
           * slow one. It reddens somebody else's unrelated push, and the
           * reflex — re-run it, it'll pass — is how a real failure gets waved
           * through later.
           *
           * 15s is headroom, not permission to be slow: still far below
           * anything that has actually hung, and it does not make a genuinely
           * broken test pass. The real cost is addressed where it lives —
           * ContactForm.test.tsx now sets `delay: null` on userEvent, which
           * drops it from 20.1s to 14.6s without changing what it asserts.
           */
          testTimeout: 15_000,
        },
      },
    ],
  },
});
