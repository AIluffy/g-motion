import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    setupFiles: [path.resolve(__dirname, 'tests/setup.ts')],
  },
});
