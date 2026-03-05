/**
 * Output Buffer Processing
 *
 * Handles GPU→CPU data transfer, formatting, and staging buffer management.
 */

import { runOutputFormatPass, releaseOutputFormatBuffer } from '.';
import { StagingBufferPool } from '../gpu/staging-pool';
import { AsyncReadbackManager } from '../runtime/async-readback';
import { setPendingReadbackCount } from '../runtime/sync';
import { tryReleasePooledOutputBufferFromTag } from '../gpu/output-buffer-pool';
import type { WebGPUFrameEncoder } from '../runtime/encoder';
import type { GPUMetricsProvider } from '../runtime/metrics';

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

export type OutputBufferLeaseManager = {
  markEntityIdsInFlight: (leaseId: number) => void;
  releaseEntityIds: (leaseId: number) => void;
};

type OutputFormatStageResult = {
  formattedBuffer: GPUBuffer;
  didFormat: boolean;
  stride: number;
  byteSize: number;
  channelsForReadback?: Array<{ index: number; property: string }>;
};

type CopyStageResult = {
  stagingBuffer: GPUBuffer;
  byteSize: number;
};

export async function processOutputBuffer(
  device: GPUDevice,
  queue: GPUQueue,
  sp: StagingBufferPool,
  readbackManager: AsyncReadbackManager | null,
  processor: OutputBufferLeaseManager,
  input: ProcessOutputBufferInput,
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
  metricsProvider?: GPUMetricsProvider,
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

  const formatResult = await formatOutputBuffer({
    device,
    queue,
    archetypeId,
    outputBuffer,
    entityCount,
    rawStride,
    outputStride,
    rawChannels,
    outputChannels,
    frame,
    submit,
  });
  const { formattedBuffer, didFormat, stride, byteSize, channelsForReadback } = formatResult;

  if (didFormat && !keep) {
    outputBuffer.destroy();
  }

  const copyResult = copyOutputBufferToStaging({
    sp,
    archetypeId,
    byteSize,
  });
  if (!copyResult) {
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

  const { stagingBuffer } = copyResult;
  if (typeof leaseId === 'number') {
    processor.markEntityIdsInFlight(leaseId);
  }
  sp.markInFlight(stagingBuffer);

  const afterSubmit = () => {
    if (didFormat) {
      releaseOutputFormatBuffer(formattedBuffer, queue);
    } else if (!keep) {
      formattedBuffer.destroy();
    }
    enqueueReadback({
      readbackManager,
      sp,
      metricsProvider,
      archetypeId,
      entityIdsForReadback,
      stagingBuffer,
      byteSize,
      stride,
      channelsForReadback,
      leaseId,
      readbackTag,
    });
  };

  copyOutputBuffer({
    device,
    frame,
    submit,
    sourceBuffer: formattedBuffer,
    stagingBuffer,
    byteSize,
    afterSubmit,
    archetypeId,
  });
}

async function formatOutputBuffer(params: {
  device: GPUDevice;
  queue: GPUQueue;
  archetypeId: string;
  outputBuffer: GPUBuffer;
  entityCount: number;
  rawStride: number;
  outputStride: number;
  rawChannels: Array<{ index: number; property: string }>;
  outputChannels: Array<{ index: number; property: string }>;
  frame?: WebGPUFrameEncoder;
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;
}): Promise<OutputFormatStageResult> {
  const {
    device,
    queue,
    archetypeId,
    outputBuffer,
    entityCount,
    rawStride,
    outputStride,
    rawChannels,
    outputChannels,
    frame,
    submit,
  } = params;
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
  const stride = didFormat ? outputStride : rawStride;
  const bufferSize = (formattedBuffer as any).size as number | undefined;
  const expectedSize = entityCount * stride * 4;
  const byteSize = Math.min(bufferSize ?? expectedSize, expectedSize);
  return { formattedBuffer, didFormat, stride, byteSize, channelsForReadback };
}

function copyOutputBufferToStaging(params: {
  sp: StagingBufferPool;
  archetypeId: string;
  byteSize: number;
}): CopyStageResult | null {
  const { sp, archetypeId, byteSize } = params;
  const stagingBuffer = sp.acquire(archetypeId, byteSize);
  if (!stagingBuffer) {
    return null;
  }
  return { stagingBuffer, byteSize };
}

function copyOutputBuffer(params: {
  device: GPUDevice;
  frame?: WebGPUFrameEncoder;
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;
  sourceBuffer: GPUBuffer;
  stagingBuffer: GPUBuffer;
  byteSize: number;
  afterSubmit: () => void;
  archetypeId: string;
}): void {
  const { device, frame, submit, sourceBuffer, stagingBuffer, byteSize, afterSubmit, archetypeId } =
    params;
  if (frame) {
    frame.recordCopy(sourceBuffer, 0, stagingBuffer, 0, byteSize);
    frame.recordAfterSubmit(afterSubmit);
    return;
  }
  const copyEncoder = device.createCommandEncoder({
    label: `copy-output-${archetypeId}`,
  });
  copyEncoder.copyBufferToBuffer(sourceBuffer, 0, stagingBuffer, 0, byteSize);
  const commandBuffer = copyEncoder.finish();
  if (submit) {
    submit(commandBuffer, afterSubmit);
  } else {
    device.queue.submit([commandBuffer]);
    afterSubmit();
  }
}

function enqueueReadback(params: {
  readbackManager: AsyncReadbackManager | null;
  sp: StagingBufferPool;
  metricsProvider?: GPUMetricsProvider;
  archetypeId: string;
  entityIdsForReadback: ArrayLike<number>;
  stagingBuffer: GPUBuffer;
  byteSize: number;
  stride: number;
  channelsForReadback?: Array<{ index: number; property: string }>;
  leaseId?: number;
  readbackTag?: unknown;
}): void {
  const {
    readbackManager,
    sp,
    metricsProvider,
    archetypeId,
    entityIdsForReadback,
    stagingBuffer,
    byteSize,
    stride,
    channelsForReadback,
    leaseId,
    readbackTag,
  } = params;
  if (!readbackManager) {
    return;
  }
  const mapPromise = stagingBuffer.mapAsync((GPUMapMode as any).READ);
  const release = () => {
    sp.markAvailable(stagingBuffer);
    tryReleasePooledOutputBufferFromTag(readbackTag);
  };
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
    release,
  );
  const pending = readbackManager.getPendingCount();
  setPendingReadbackCount(pending);
  if (metricsProvider) {
    metricsProvider.updateStatus({
      queueDepth: pending,
      timeoutRate: readbackManager.getTimeoutRate(),
    });
  }
}
