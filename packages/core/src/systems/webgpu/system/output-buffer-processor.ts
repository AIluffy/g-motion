import type { GPUBatchDescriptor, GPUBatchWithPreprocessedKeyframes } from '../../../types';
import type { World } from '../../../world';
import type { ComputeBatchProcessor } from '../../batch';
import { getGPUChannelMappingRegistry } from '../../../webgpu/channel-mapping';
import { dispatchGPUBatch } from '../dispatch';
import { debugIO, float32Preview, firstEntityChannelPreview } from '../debug';
import { processOutputBuffer } from '../output-buffer-processing';
import {
  runKeyframeInterpPass,
  runKeyframePreprocessPass,
  runKeyframeSearchPass,
} from '../keyframe';
import { maybeRunViewportCulling } from './viewport-culling-system';
import type { WebGPUComputeRuntime } from './runtime';

export async function processInterpolationArchetype(params: {
  runtime: WebGPUComputeRuntime;
  device: GPUDevice;
  world: World | null;
  processor: ComputeBatchProcessor;
  archetypeId: string;
  batch: GPUBatchDescriptor;
  debugIOEnabled: boolean;
  preprocessEnabled: boolean;
  useOptimizedKeyframeSearch: boolean;
  viewportCullingEnabled: boolean;
  viewportCullingAsyncEnabled: boolean;
}): Promise<void> {
  const {
    runtime,
    device,
    world,
    processor,
    archetypeId,
    batch,
    debugIOEnabled,
    preprocessEnabled,
    useOptimizedKeyframeSearch,
    viewportCullingEnabled,
    viewportCullingAsyncEnabled,
  } = params;

  const sp = runtime.stagingPool;
  if (!sp) return;

  const queue = device.queue;
  const channelRegistry = getGPUChannelMappingRegistry();

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
  let entityCount = gpuBatch.entityCount;
  let entityIdsForReadback: ArrayLike<number> = gpuBatch.entityIds;
  let leaseId = gpuBatch.entityIdsLeaseId;

  if (preprocessEnabled && gpuBatch.preprocessedKeyframes && rawStride > 0) {
    const batchWithPreprocessed = gpuBatch as unknown as GPUBatchWithPreprocessedKeyframes;
    const preprocessResult = await runKeyframePreprocessPass(device, queue, batchWithPreprocessed);
    if (preprocessResult) {
      const searchResult = await runKeyframeSearchPass(
        device,
        queue,
        preprocessResult,
        gpuBatch.statesData,
        rawStride,
        useOptimizedKeyframeSearch,
      );
      if (searchResult) {
        const interpOutput = await runKeyframeInterpPass(
          device,
          queue,
          preprocessResult.packedKeyframesBuffer,
          searchResult.searchResultsBuffer,
          searchResult.outputIndicesData,
          searchResult.entryCount,
          gpuBatch.entityCount,
          rawStride,
          archetypeId,
        );
        if (interpOutput) {
          outputBuffer = interpOutput;
        }
      }
    }
  }

  if (!outputBuffer) {
    const result = await dispatchGPUBatch(
      device,
      queue,
      gpuBatch,
      runtime.timingHelper,
      archetypeId,
      rawStride,
    );
    outputBuffer = result.outputBuffer;
    entityCount = result.entityCount;
  }

  if (!outputBuffer) {
    if (typeof leaseId === 'number') {
      processor.releaseEntityIds(leaseId);
    }
    return;
  }

  if (viewportCullingEnabled && world && entityCount > 0) {
    const cullRes = await maybeRunViewportCulling({
      runtime,
      device,
      queue,
      world,
      processor,
      archetypeId,
      batch: gpuBatch,
      outputBuffer,
      entityCount,
      entityIdsForReadback,
      leaseId,
      rawStride,
      outputStride,
      rawChannels,
      outputChannels,
      asyncEnabled: viewportCullingAsyncEnabled,
    });

    if (cullRes.kind === 'enqueued') {
      return;
    }
    outputBuffer = cullRes.outputBuffer;
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

  await processOutputBuffer(device, queue, sp, runtime.readbackManager, processor, {
    archetypeId,
    outputBuffer,
    entityCount,
    entityIdsForReadback,
    leaseId,
    rawStride,
    outputStride,
    rawChannels,
    outputChannels,
  });
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
