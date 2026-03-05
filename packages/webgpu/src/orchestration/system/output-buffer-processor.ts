import type {
  GPUMetricsProvider,
  GPUBatchDescriptor,
  GPUBatchWithPreprocessedKeyframes,
  WebGPUEngine,
  WebGPUFrameEncoder,
} from '../../bridge/types';
import { getGPUModuleSync } from '../../bridge';
import type { World } from '@g-motion/core/runtime';
import type { ComputeBatchProcessor } from '@g-motion/core/batch';
import { debugIO, firstEntityChannelPreview, float32Preview } from '../debug';
import { maybeRunViewportCulling } from './viewport-culling-system';

export async function processInterpolationArchetype(params: {
  engine: WebGPUEngine;
  device: GPUDevice;
  world: World | null;
  processor: ComputeBatchProcessor;
  metricsProvider: GPUMetricsProvider;
  archetypeId: string;
  batch: GPUBatchDescriptor;
  debugIOEnabled: boolean;
  preprocessEnabled: boolean;
  useOptimizedKeyframeSearch: boolean;
  keyframeSearchIndexedEnabled: boolean;
  keyframeSearchIndexedMinKeyframes: number;
  keyframeEntryExpandOnGPUEnabled: boolean;
  viewportCullingEnabled: boolean;
  viewportCullingAsyncEnabled: boolean;
  statesConditionalUploadEnabled: boolean;
  forceStatesUploadEnabled: boolean;
  outputBufferReuseEnabled: boolean;
  frame?: WebGPUFrameEncoder;
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;
}): Promise<void> {
  const {
    engine,
    device,
    world,
    processor,
    metricsProvider,
    archetypeId,
    batch,
    debugIOEnabled,
    preprocessEnabled,
    useOptimizedKeyframeSearch,
    keyframeSearchIndexedEnabled,
    keyframeSearchIndexedMinKeyframes,
    keyframeEntryExpandOnGPUEnabled,
    viewportCullingEnabled,
    viewportCullingAsyncEnabled,
    statesConditionalUploadEnabled,
    forceStatesUploadEnabled,
    outputBufferReuseEnabled,
    frame,
    submit,
  } = params;

  const sp = engine.stagingPool;
  if (!sp) return;

  const gpu = getGPUModuleSync();
  if (!gpu) return;

  const queue = device.queue;
  const persistent = gpu.getPersistentGPUBufferManager(device);
  const channelRegistry = gpu.getGPUChannelMappingRegistry();

  const table = channelRegistry.getChannels(archetypeId);
  const outputChannels = table?.channels ?? [];
  const rawChannels = table?.rawChannels ?? outputChannels;
  const rawStride = table?.rawStride ?? (rawChannels.length || 1);
  const outputStride = table?.stride ?? (outputChannels.length || 1);

  const gpuBatch = batch;
  if (debugIOEnabled) {
    debugIO('input', {
      archetypeId,
      entityCount: gpuBatch.entityCount,
      workgroupHint: gpuBatch.workgroupHint,
      keyframesVersion: gpuBatch.keyframesVersion,
      rawStride,
      outputStride,
      rawChannels: rawChannels.slice(0, 24).map((c) => c.property),
      outputChannels: outputChannels.slice(0, 24).map((c) => c.property),
      statesPreview: float32Preview(gpuBatch.statesData, Math.min(32, gpuBatch.entityCount * 4)),
      keyframesPreview: float32Preview(gpuBatch.keyframesData, 40),
      preprocessed: gpuBatch.preprocessedKeyframes
        ? {
            rawKeyframesPerEntity: gpuBatch.preprocessedKeyframes.rawKeyframesPerEntity.map(
              (a) => a.length,
            ),
            channelMapPerEntity: gpuBatch.preprocessedKeyframes.channelMapPerEntity.map(
              (a) => a.length,
            ),
          }
        : undefined,
    });
  }

  let outputBuffer: GPUBuffer | null = null;
  let outputBufferTag: unknown | undefined;
  let entityCount = gpuBatch.entityCount;
  let entityIdsForReadback: ArrayLike<number> = gpuBatch.entityIds;
  let leaseId = gpuBatch.entityIdsLeaseId;

  if (preprocessEnabled && gpuBatch.preprocessedKeyframes && rawStride > 0) {
    const batchWithPreprocessed = gpuBatch as unknown as GPUBatchWithPreprocessedKeyframes;
    const preprocessResult = await gpu.runKeyframePreprocessPass(
      device,
      queue,
      batchWithPreprocessed,
      frame,
      submit,
      {
        indexedSearchEnabled: keyframeSearchIndexedEnabled,
        indexedSearchMinKeyframes: keyframeSearchIndexedMinKeyframes,
      },
    );
    if (preprocessResult) {
      const interpOutput = await gpu.runKeyframeInterpPass(
        device,
        queue,
        archetypeId,
        preprocessResult,
        gpuBatch.statesData,
        rawStride,
        gpuBatch.entityCount,
        useOptimizedKeyframeSearch,
        persistent,
        frame,
        submit,
        {
          entryExpansionOnGPUEnabled: keyframeEntryExpandOnGPUEnabled,
          indexedSearchEnabled: keyframeSearchIndexedEnabled,
          indexedSearchMinKeyframes: keyframeSearchIndexedMinKeyframes,
          statesVersion: gpuBatch.statesVersion,
          statesConditionalUploadEnabled,
          forceStatesUploadEnabled,
          reuseOutputBuffer: outputBufferReuseEnabled && engine.readbackManager !== null,
        },
      );
      if (interpOutput) {
        outputBuffer = interpOutput.outputBuffer;
        outputBufferTag = interpOutput.outputBufferTag;
      }
    }
  }

  if (!outputBuffer) {
    const result = await gpu.dispatchGPUBatch(
      device,
      queue,
      gpuBatch,
      engine.timestampManager,
      archetypeId,
      rawStride,
      {
        statesConditionalUploadEnabled,
        forceStatesUploadEnabled,
        reuseOutputBuffer: outputBufferReuseEnabled && engine.readbackManager !== null,
      },
      frame,
      submit,
    );
    outputBuffer = result.outputBuffer;
    outputBufferTag = result.outputBufferTag;
    entityCount = result.entityCount;
  }

  if (!outputBuffer) {
    if (typeof leaseId === 'number') {
      processor.releaseEntityIds(leaseId);
    }
    return;
  }

  if (viewportCullingEnabled && world && entityCount > 0) {
    const sourceOutputBuffer = outputBuffer;
    const sourceOutputBufferTag = outputBufferTag;
    const cullRes = await maybeRunViewportCulling({
      engine,
      device,
      queue,
      world,
      processor,
      archetypeId,
      batch: gpuBatch,
      outputBuffer,
      sourceOutputBufferTag,
      entityCount,
      entityIdsForReadback,
      leaseId,
      rawStride,
      outputStride,
      rawChannels,
      outputChannels,
      asyncEnabled: viewportCullingAsyncEnabled,
      frame,
      submit,
    });

    if (cullRes.kind === 'enqueued') {
      return;
    }
    outputBuffer = cullRes.outputBuffer;
    outputBufferTag = outputBuffer === sourceOutputBuffer ? sourceOutputBufferTag : undefined;
    entityCount = cullRes.entityCount;
    entityIdsForReadback = cullRes.entityIdsForReadback;
    leaseId = cullRes.leaseId;
  }

  if (debugIOEnabled && outputBuffer && entityCount > 0) {
    debugIO('pre-output', {
      archetypeId,
      entityCount,
      rawStride,
      outputStride,
      channels: outputChannels.slice(0, 24).map((c) => c.property),
    });
  }

  await gpu.processOutputBuffer(
    device,
    queue,
    sp,
    engine.readbackManager,
    processor,
    {
      archetypeId,
      outputBuffer,
      entityCount,
      entityIdsForReadback,
      leaseId,
      rawStride,
      outputStride,
      rawChannels,
      outputChannels,
      keepOutputBuffer: outputBufferTag !== undefined,
      readbackTag: outputBufferTag,
    },
    frame,
    submit,
    metricsProvider,
  );
}

export function maybeDebugReadbackOutput(params: {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  stride: number;
  values: Float32Array;
  channels?: Array<{ index: number; property: string }>;
  expired: boolean;
}): void {
  const { archetypeId, entityIds, stride, values, channels, expired } = params;
  debugIO('output', {
    archetypeId,
    entityCount: entityIds.length,
    stride,
    expired,
    channels: channels?.map((c) => c.property) ?? undefined,
    firstEntity: firstEntityChannelPreview(values, stride, channels),
    valuesPreview: float32Preview(values, Math.min(64, stride * 4)),
  });
}
