import { defineConfig } from '@rslib/core';
import { rawAssetRule, webPreset } from '../../tools/rslib-preset';

export default defineConfig({
  ...webPreset,
  ...rawAssetRule,
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
      public: './src/public.ts',
      internal: './src/internal.ts',
      testing: './src/testing.ts',
      compute: './src/compute.ts',
      buffer: './src/buffer.ts',
      wgsl: './src/wgsl.ts',
      engine: './src/engine.ts',
      shaders: './src/shaders.ts',
      orchestration: './src/orchestration.ts',
    },
  },
});
