import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
    },
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
  ],
  tools: {
    rspack: {
      module: {
        rules: [
          {
            resourceQuery: /raw$/,
            type: 'asset/source',
          },
        ],
      },
    },
  },
});
