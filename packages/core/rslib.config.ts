import { defineConfig } from '@rslib/core';
import { rawAssetRule, webPreset } from '../../tools/rslib-preset';

export default defineConfig({
  ...webPreset,
  ...rawAssetRule,
});
