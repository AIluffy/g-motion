import { defineConfig } from '@rslib/core';
import { nodePreset } from '../../tools/rslib-preset';

export default defineConfig({
  ...nodePreset,
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
    },
  },
});
