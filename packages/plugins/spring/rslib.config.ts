import { defineConfig } from '@rslib/core';

export default defineConfig({
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
