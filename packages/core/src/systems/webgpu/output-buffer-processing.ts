/**
 * Output Buffer Processing
 *
 * Handles GPU→CPU data transfer, formatting, and staging buffer management.
 */

import { runOutputFormatPass, releaseOutputFormatBuffer } from './output-format';
import { StagingBufferPool } from '../../webgpu/staging-pool';
import { AsyncReadbackManager } from '../../webgpu/async-readback';
import { ComputeBatchProcessor } from '../batch/processor';
import { setPendingReadbackCount } from '../../webgpu/sync-manager';
import { tryReleasePooledOutputBufferFromTag } from './output-buffer-pool';
import type { WebGPUFrameEncoder } from './frame-encoder';

export interface ProcessOutputBufferInput {
  archetypeId: string;
  outputBuffer: GPUBuffer;
  entityCount: number;
  entityIdsForReadback: ArrayLike<number>;
  leaseId?: number;
  rawStride: number;
  outputStride: number;
  rawChannels: Array<{ index: number; property: string }>;
  outputChannels: Array<{ index: number; property: string }>;
  keepOutputBuffer?: boolean;
  readbackTag?: unknown;
}

export async function processOutputBuffer(
  device: GPUDevice,
  queue: GPUQueue,
  sp: StagingBufferPool,
  readbackManager: AsyncReadbackManager | null,
  processor: ComputeBatchProcessor,
  input: ProcessOutputBufferInput,
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
): Promise<void> {
  const {
    archetypeId,
    outputBuffer,
    entityCount,
    entityIdsForReadback,
    leaseId,
    rawStride,
    outputStride,
    rawChannels,
    outputChannels,
    keepOutputBuffer,
    readbackTag,
  } = input;
  const keep = keepOutputBuffer === true && readbackManager !== null;

  if (entityCount <= 0) {
    if (keep) {
      tryReleasePooledOutputBufferFromTag(readbackTag);
    } else {
      outputBuffer.destroy();
    }
    if (typeof leaseId === 'number') {
      processor.releaseEntityIds(leaseId);
    }
    return;
  }

  const usedRawValueCount = entityCount * rawStride;
  const formattedBuffer = await runOutputFormatPass(
    device,
    queue,
    archetypeId,
    outputBuffer,
    usedRawValueCount,
    rawStride,
    outputChannels.length ? outputChannels : undefined,
    frame,
    submit,
  );

  const didFormat = formattedBuffer !== outputBuffer;
  const channelsForReadback = didFormat
    ? outputChannels.length
      ? outputChannels
      : undefined
    : rawChannels.length
      ? rawChannels
      : undefined;

  if (didFormat) {
    if (!keep) {
      outputBuffer.destroy();
    }
  }

  const stride = didFormat ? outputStride : rawStride;
  const bufferSize = (formattedBuffer as any).size as number | undefined;
  const expectedSize = entityCount * stride * 4;
  const byteSize = Math.min(bufferSize ?? expectedSize, expectedSize);

  const stagingBuffer = sp.acquire(archetypeId, byteSize);
  if (!stagingBuffer) {
    if (didFormat) {
      formattedBuffer.destroy();
    } else if (!keep) {
      formattedBuffer.destroy();
    }
    if (keep) {
      tryReleasePooledOutputBufferFromTag(readbackTag);
    }
    if (typeof leaseId === 'number') {
      processor.releaseEntityIds(leaseId);
    }
    return;
  }
  if (typeof leaseId === 'number') {
    processor.markEntityIdsInFlight(leaseId);
  }
  sp.markInFlight(stagingBuffer);

  let mapPromise: Promise<void> | null = null;
  let resolveMapPromise: (() => void) | null = null;
  let rejectMapPromise: ((e: unknown) => void) | null = null;

  if (readbackManager) {
    mapPromise = new Promise<void>((resolve, reject) => {
      resolveMapPromise = resolve;
      rejectMapPromise = reject;
    });
    readbackManager.enqueueMapAsync(
      archetypeId,
      entityIdsForReadback,
      stagingBuffer,
      mapPromise,
      byteSize,
      200,
      stride,
      channelsForReadback,
      leaseId,
      readbackTag,
    );
    setPendingReadbackCount(readbackManager.getPendingCount());
  }

  const afterSubmit = () => {
    if (didFormat) {
      releaseOutputFormatBuffer(formattedBuffer, queue);
    } else {
      if (!keep) {
        formattedBuffer.destroy();
      }
    }
    if (readbackManager) {
      const p = stagingBuffer.mapAsync((GPUMapMode as any).READ);
      p.then(() => resolveMapPromise?.()).catch((e) => rejectMapPromise?.(e));
    }
  };

  if (frame) {
    frame.recordCopy(formattedBuffer, 0, stagingBuffer, 0, byteSize);
    frame.recordAfterSubmit(afterSubmit);
    return;
  }

  const copyEncoder = device.createCommandEncoder({
    label: `copy-output-${archetypeId}`,
  });
  copyEncoder.copyBufferToBuffer(formattedBuffer, 0, stagingBuffer, 0, byteSize);
  const commandBuffer = copyEncoder.finish();

  if (submit) {
    submit(commandBuffer, afterSubmit);
  } else {
    queue.submit([commandBuffer]);
    afterSubmit();
  }

  return;
}
