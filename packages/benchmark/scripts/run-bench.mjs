import { ComputeBenchmark } from '../dist/index.js';

const bench = new ComputeBenchmark();
const result = await bench.benchmark(
  'noop',
  async () => {
    await Promise.resolve();
  },
  { iterations: 3, warmup: false },
);

console.log(`[benchmark] ${result.name}: avg=${result.avgTime.toFixed(4)}ms`);
