import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // The pure-logic libs under test share modules with code that touches
    // Prisma at import time, so give the client a well-formed (if unused)
    // URL and the secrets key derivation depends on.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DIRECT_URL: 'postgresql://test:test@localhost:5432/test',
      SESSION_SECRET: 'vitest-session-secret',
      NEXT_PUBLIC_SITE_URL: 'https://test.example',
    },
  },
});
