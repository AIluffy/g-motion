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
}

export async function processOutputBuffer(
  device: GPUDevice,
  queue: GPUQueue,
  sp: StagingBufferPool,
  readbackManager: AsyncReadbackManager | null,
  processor: ComputeBatchProcessor,
  input: ProcessOutputBufferInput,
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
  } = input;

  if (entityCount <= 0) {
    outputBuffer.destroy();
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
    outputBuffer.destroy();
  }

  const stride = didFormat ? outputStride : rawStride;
  const bufferSize = (formattedBuffer as any).size as number | undefined;
  const expectedSize = entityCount * stride * 4;
  const byteSize = Math.min(bufferSize ?? expectedSize, expectedSize);

  const stagingBuffer = sp.acquire(archetypeId, byteSize);
  if (!stagingBuffer) {
    formattedBuffer.destroy();
    if (typeof leaseId === 'number') {
      processor.releaseEntityIds(leaseId);
    }
    return;
  }
  if (typeof leaseId === 'number') {
    processor.markEntityIdsInFlight(leaseId);
  }
  sp.markInFlight(stagingBuffer);

  const copyEncoder = device.createCommandEncoder({
    label: `copy-output-${archetypeId}`,
  });
  copyEncoder.copyBufferToBuffer(formattedBuffer, 0, stagingBuffer, 0, byteSize);
  queue.submit([copyEncoder.finish()]);
  if (didFormat) {
    releaseOutputFormatBuffer(formattedBuffer, queue);
  } else {
    formattedBuffer.destroy();
  }

  if (readbackManager) {
    const mapPromise = stagingBuffer.mapAsync((GPUMapMode as any).READ);
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
    );
    setPendingReadbackCount(readbackManager.getPendingCount());
  }
}
