import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
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
        },
      },
    ],
  },
});
