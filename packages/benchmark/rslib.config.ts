import { defineConfig } from '@rslib/core';
import { webPreset } from '../../tools/rslib-preset';

export default defineConfig({
  ...webPreset,
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
    },
  },
});
