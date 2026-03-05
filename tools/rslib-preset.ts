import type { RslibConfig } from '@rslib/core';

/** Browser runtime packages (core / animation / webgpu / plugins / shared / values). */
export const webPreset: Pick<RslibConfig, 'lib' | 'output'> = {
  lib: [
    { format: 'esm', syntax: 'es2021', dts: true },
    { format: 'cjs', syntax: 'es2021' },
  ],
  output: { target: 'web' },
};

/** Node-only packages (for example test-utils). */
export const nodePreset: Pick<RslibConfig, 'lib' | 'output'> = {
  lib: [
    { format: 'esm', syntax: 'es2021', dts: true },
    { format: 'cjs', syntax: 'es2021' },
  ],
  output: { target: 'node' },
};

/** WGSL / raw asset loader rule. */
export const rawAssetRule: Pick<RslibConfig, 'tools'> = {
  tools: {
    rspack: {
      module: {
        rules: [{ resourceQuery: /raw$/, type: 'asset/source' as const }],
      },
    },
  },
};
