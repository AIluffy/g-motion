import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    tsconfigPath: './tsconfig.json',
    entry: {
      index: './src/index.ts',
      public: './src/public.ts',
      internal: './src/internal.ts',
      testing: './src/testing.ts',
    },
  },
  lib: [
    {
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
    {
      format: 'cjs',
      syntax: 'es2021',
    },
  ],
  output: {
    target: 'node',
  },
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
