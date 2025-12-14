import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    alias: {
      '@g-motion/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
