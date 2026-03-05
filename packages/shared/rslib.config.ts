import { defineConfig } from '@rslib/core';
import { webPreset } from '../../tools/rslib-preset';

export default defineConfig({
  ...webPreset,
  source: {
    entry: {
      index: './src/index.ts',
      'types-entry': './src/types-entry.ts',
      'dom-entry': './src/dom-entry.ts',
      'transform-entry': './src/transform-entry.ts',
    },
  },
});
