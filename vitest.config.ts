import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests only — pure logic, no database and no server.
 *
 * The route behaviour is covered by exercising a real build against a real
 * Postgres; what belongs here is the arithmetic and the decision functions,
 * which are where a silent regression would be most expensive and hardest to
 * notice by hand.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
