import { defineConfig } from '@rslib/core';
import { rawAssetRule, webPreset } from '../../tools/rslib-preset';

const entry = {
  index: './src/index.ts',
  ecs: './src/ecs.ts',
  runtime: './src/runtime.ts',
  systems: './src/systems.ts',
  components: './src/components.ts',
  scheduler: './src/scheduler.ts',
  batch: './src/batch.ts',
  'webgpu-systems': './src/webgpu-systems.ts',
};

export default defineConfig({
  ...webPreset,
  ...rawAssetRule,
  source: {
    entry,
  },
});
