import { describe, it, expect } from 'vitest';

import { motion, getGPUBatchStatus, getGPUMetrics, isGPUAvailable } from '@g-motion/animation';

describe.skip('gpu fusion smoke (browser-only)', () => {
  it('collects status and metrics when above threshold', async () => {
    expect(isGPUAvailable()).toBe(false);
    expect(getGPUBatchStatus().enabled).toBe(false);

    for (let i = 0; i < 5; i++) {
      motion(i)
        .mark([{ to: i + 1, at: 10 }])
        .animate();
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(Array.isArray(getGPUMetrics())).toBe(true);
  });
});
