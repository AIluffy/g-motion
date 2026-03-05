import { defineConfig } from '@rslib/core';
import { rawAssetRule, webPreset } from '../../../tools/rslib-preset';

export default defineConfig({
  ...webPreset,
  ...rawAssetRule,
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
      'auto-register': './src/auto-register.ts',
    },
  },
});
