import { describe, expect, test, vi } from 'vitest';

vi.mock('../src/webgpu/output-format', () => ({
  runOutputFormatPass: vi.fn(),
  releaseOutputFormatBuffer: vi.fn(),
}));

import { processOutputBuffer } from '../src/webgpu/output-buffer-processing';
import { runOutputFormatPass, releaseOutputFormatBuffer } from '../src/webgpu/output-format';

if (!(globalThis as any).GPUMapMode) {
  (globalThis as any).GPUMapMode = { READ: 1 };
}

function createBuffer(size = 64) {
  return {
    size,
    destroy: vi.fn(),
    mapAsync: vi.fn(() => Promise.resolve()),
  } as any;
}

describe('processOutputBuffer', () => {
  test('releases resources when entityCount is zero', async () => {
    const outputBuffer = createBuffer();
    const processor = {
      markEntityIdsInFlight: vi.fn(),
      releaseEntityIds: vi.fn(),
    };

    await processOutputBuffer({} as any, {} as any, {} as any, null, processor, {
      archetypeId: 'arch',
      outputBuffer,
      entityCount: 0,
      entityIdsForReadback: [],
      leaseId: 7,
      rawStride: 1,
      outputStride: 1,
      rawChannels: [],
      outputChannels: [],
    });

    expect(outputBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(processor.releaseEntityIds).toHaveBeenCalledWith(7);
  });

  test('formats, copies, and enqueues readback with output channels', async () => {
    const outputBuffer = createBuffer(128);
    const formattedBuffer = createBuffer(64);
    const stagingBuffer = createBuffer(256);
    const sp = {
      acquire: vi.fn(() => stagingBuffer),
      markInFlight: vi.fn(),
    };
    const processor = {
      markEntityIdsInFlight: vi.fn(),
      releaseEntityIds: vi.fn(),
    };
    const readbackManager = {
      enqueueMapAsync: vi.fn(),
      getPendingCount: vi.fn(() => 2),
      getTimeoutRate: vi.fn(() => 0.25),
    };
    const metricsProvider = {
      updateStatus: vi.fn(),
    };
    const frame = {
      recordCopy: vi.fn(),
      recordAfterSubmit: (cb: () => void) => cb(),
    };
    const queue = {};
    const entityIds = [1, 2];
    const outputChannels = [{ index: 0, property: 'x' }];
    const rawChannels = [{ index: 0, property: 'raw' }];

    (runOutputFormatPass as any).mockResolvedValue(formattedBuffer);

    await processOutputBuffer(
      {} as any,
      queue as any,
      sp as any,
      readbackManager as any,
      processor,
      {
        archetypeId: 'arch',
        outputBuffer,
        entityCount: 2,
        entityIdsForReadback: entityIds,
        leaseId: 5,
        rawStride: 2,
        outputStride: 3,
        rawChannels,
        outputChannels,
      },
      frame as any,
      undefined,
      metricsProvider as any,
    );

    expect(runOutputFormatPass).toHaveBeenCalled();
    expect(outputBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(releaseOutputFormatBuffer).toHaveBeenCalledWith(formattedBuffer, queue);
    expect(sp.markInFlight).toHaveBeenCalledWith(stagingBuffer);
    expect(processor.markEntityIdsInFlight).toHaveBeenCalledWith(5);
    expect(readbackManager.enqueueMapAsync).toHaveBeenCalledWith(
      'arch',
      entityIds,
      stagingBuffer,
      expect.any(Promise),
      expect.any(Number),
      200,
      3,
      outputChannels,
      5,
      undefined,
    );
    expect(metricsProvider.updateStatus).toHaveBeenCalledWith({
      queueDepth: 2,
      timeoutRate: 0.25,
    });
  });
});
