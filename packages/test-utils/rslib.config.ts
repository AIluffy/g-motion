import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
      setup: './src/setup.ts',
    },
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
  ],
});
