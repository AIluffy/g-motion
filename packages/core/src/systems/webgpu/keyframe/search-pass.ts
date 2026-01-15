/**
 * Keyframe Search Pass
 *
 * GPU compute pass to find active keyframes for current animation time.
 * Searches through packed keyframe data to find which keyframes are active
 * for each entity/channel combination.
 */

import {
  CHANNEL_MAP_STRIDE,
  RAW_KEYFRAME_STRIDE,
  SEARCH_RESULT_STRIDE,
} from '../../../webgpu/keyframe-preprocess-shader';
import { getPersistentGPUBufferManager } from '../../../webgpu/persistent-buffer-manager';
import {
  getKeyframeEntryExpandPipeline,
  getKeyframeSearchPipeline,
  keyframeEntryExpandBindGroupLayout,
  keyframeSearchBindGroupLayout,
  getKeyframeSearchWindowPipeline,
  keyframeSearchWindowBindGroupLayout,
} from './pipelines';
import type { KeyframePreprocessResult, KeyframeSearchResultGPU } from './types';
import type { WebGPUFrameEncoder } from '../frame-encoder';

const s_keyframeEntryExpandParams = new Uint32Array(4);

type KeyframeSearchPassOptions = {
  entryExpansionOnGPUEnabled?: boolean;
  indexedSearchEnabled?: boolean;
  indexedSearchMinKeyframes?: number;
  statesVersion?: number;
  statesConditionalUploadEnabled?: boolean;
  forceStatesUploadEnabled?: boolean;
};

type KeyframeSearchPassSubmit = (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void;

async function recordKeyframeSearchWindowPass(params: {
  device: GPUDevice;
  entryCount: number;
  preprocess: KeyframePreprocessResult;
  searchTimesBuffer: GPUBuffer;
  keyframeOffsetsBuffer: GPUBuffer;
  keyframeCountsBuffer: GPUBuffer;
  cmdEncoder?: GPUCommandEncoder;
  pass?: GPUComputePassEncoder;
}): Promise<boolean> {
  const {
    device,
    entryCount,
    preprocess,
    searchTimesBuffer,
    keyframeOffsetsBuffer,
    keyframeCountsBuffer,
    cmdEncoder,
    pass,
  } = params;
  if (
    !preprocess.channelMapsBuffer ||
    !preprocess.blockStartOffsetsBuffer ||
    !preprocess.blockStartTimesBuffer
  ) {
    return false;
  }
  const pipeline = await getKeyframeSearchWindowPipeline(device);
  if (!pipeline || !keyframeSearchWindowBindGroupLayout) {
    return false;
  }
  const bindGroup = device.createBindGroup({
    layout: keyframeSearchWindowBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: preprocess.channelMapsBuffer } },
      { binding: 1, resource: { buffer: searchTimesBuffer } },
      { binding: 2, resource: { buffer: preprocess.blockStartOffsetsBuffer } },
      { binding: 3, resource: { buffer: preprocess.blockStartTimesBuffer } },
      { binding: 4, resource: { buffer: keyframeOffsetsBuffer } },
      { binding: 5, resource: { buffer: keyframeCountsBuffer } },
    ],
  });
  if (pass) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);
    return true;
  }
  if (cmdEncoder) {
    const p = cmdEncoder.beginComputePass();
    p.setPipeline(pipeline);
    p.setBindGroup(0, bindGroup);
    p.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);
    p.end();
    return true;
  }
  return true;
}

export async function runKeyframeSearchPass(
  device: GPUDevice,
  queue: GPUQueue,
  archetypeId: string,
  preprocess: KeyframePreprocessResult,
  statesData: Float32Array,
  channelCount: number,
  useOptimizedShader: boolean,
  persistentOverride?: ReturnType<typeof getPersistentGPUBufferManager>,
  frame?: WebGPUFrameEncoder | KeyframeSearchPassSubmit | KeyframeSearchPassOptions,
  submit?: KeyframeSearchPassSubmit | KeyframeSearchPassOptions,
  options?: KeyframeSearchPassOptions,
): Promise<KeyframeSearchResultGPU | null> {
  const isFrameEncoder = (v: unknown): v is WebGPUFrameEncoder => {
    return (
      !!v &&
      typeof v === 'object' &&
      'beginComputePass' in v &&
      typeof (v as { beginComputePass: unknown }).beginComputePass === 'function'
    );
  };

  let resolvedFrame: WebGPUFrameEncoder | undefined;
  let resolvedSubmit: KeyframeSearchPassSubmit | undefined;
  let resolvedOptions: KeyframeSearchPassOptions | undefined;

  if (isFrameEncoder(frame)) {
    resolvedFrame = frame;
    if (typeof submit === 'function') {
      resolvedSubmit = submit;
      resolvedOptions = options;
    } else {
      resolvedSubmit = undefined;
      resolvedOptions = (submit as KeyframeSearchPassOptions) ?? options;
    }
  } else if (typeof frame === 'function') {
    resolvedFrame = undefined;
    resolvedSubmit = frame as KeyframeSearchPassSubmit;
    resolvedOptions = (submit as KeyframeSearchPassOptions) ?? options;
  } else {
    resolvedFrame = undefined;
    resolvedSubmit = typeof submit === 'function' ? submit : undefined;
    resolvedOptions =
      (frame as KeyframeSearchPassOptions) ??
      (typeof submit === 'object' ? (submit as KeyframeSearchPassOptions) : undefined) ??
      options;
  }

  const rawCount = preprocess.rawKeyframeData.length / RAW_KEYFRAME_STRIDE;
  const entryCount = preprocess.mapData.length / CHANNEL_MAP_STRIDE;
  if (!rawCount || !entryCount) {
    return null;
  }

  const indexedSearchEnabled =
    resolvedOptions?.indexedSearchEnabled === true &&
    rawCount >= (resolvedOptions?.indexedSearchMinKeyframes ?? 64) &&
    !!preprocess.blockStartOffsetsBuffer &&
    !!preprocess.blockStartTimesBuffer;

  const entryExpansionOnGPUEnabled = resolvedOptions?.entryExpansionOnGPUEnabled !== false;
  if (!entryExpansionOnGPUEnabled) {
    return null;
  }

  try {
    const persistent = persistentOverride ?? getPersistentGPUBufferManager(device);

    const statesConditionalUploadEnabled = resolvedOptions?.statesConditionalUploadEnabled === true;
    const forceStatesUploadEnabled = resolvedOptions?.forceStatesUploadEnabled === true;
    const statesContentVersion =
      statesConditionalUploadEnabled && typeof resolvedOptions?.statesVersion === 'number'
        ? resolvedOptions.statesVersion
        : undefined;
    const shouldForceUploadStates = forceStatesUploadEnabled || !statesConditionalUploadEnabled;

    const statesBuffer = persistent.getOrCreateBuffer(
      `states:${archetypeId}`,
      statesData,
      (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
      {
        label: `state-${archetypeId}`,
        allowGrowth: true,
        skipChangeDetection: shouldForceUploadStates,
        contentVersion: statesContentVersion,
        forceUpdate: forceStatesUploadEnabled,
      },
    );

    const searchTimesBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchTimesGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-times-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const keyframeOffsetsBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchOffsetsGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-offsets-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const keyframeCountsBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchCountsGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-counts-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const outputIndicesBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeInterpOutputIndicesGpuExpand:${archetypeId}`,
      entryCount * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-interp-output-indices-gpu-expand-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    s_keyframeEntryExpandParams[0] = channelCount >>> 0;
    s_keyframeEntryExpandParams[1] = 0;
    s_keyframeEntryExpandParams[2] = 0;
    s_keyframeEntryExpandParams[3] = 0;

    const paramsBuffer = persistent.getOrCreateBuffer(
      `keyframeEntryExpandParams:${archetypeId}`,
      s_keyframeEntryExpandParams,
      (GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) as number,
      {
        label: `motion-keyframe-entry-expand-params-${archetypeId}`,
        skipChangeDetection: true,
      },
    );

    const searchResultsBuffer = persistent.getOrCreateEmptyBuffer(
      `keyframeSearchResults:${archetypeId}`,
      entryCount * SEARCH_RESULT_STRIDE * 4,
      GPUBufferUsage.STORAGE as number,
      {
        label: `motion-keyframe-search-results-${archetypeId}`,
        allowGrowth: true,
      },
    ).buffer;

    const entryExpandPipeline = await getKeyframeEntryExpandPipeline(device);
    const searchPipeline = await getKeyframeSearchPipeline(device, useOptimizedShader);
    if (
      !entryExpandPipeline ||
      !keyframeEntryExpandBindGroupLayout ||
      !searchPipeline ||
      !keyframeSearchBindGroupLayout
    ) {
      return null;
    }

    const entryExpandBindGroup = device.createBindGroup({
      layout: keyframeEntryExpandBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: statesBuffer } },
        { binding: 1, resource: { buffer: preprocess.channelMapsBuffer } },
        { binding: 2, resource: { buffer: preprocess.entityIndexByEntryBuffer } },
        { binding: 3, resource: { buffer: preprocess.channelIndexByEntryBuffer } },
        { binding: 4, resource: { buffer: paramsBuffer } },
        { binding: 5, resource: { buffer: searchTimesBuffer } },
        { binding: 6, resource: { buffer: keyframeOffsetsBuffer } },
        { binding: 7, resource: { buffer: keyframeCountsBuffer } },
        { binding: 8, resource: { buffer: outputIndicesBuffer } },
      ],
    });

    const searchBindGroup = device.createBindGroup({
      layout: keyframeSearchBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: preprocess.packedKeyframesBuffer } },
        { binding: 1, resource: { buffer: preprocess.keyframeStartTimesBuffer } },
        { binding: 2, resource: { buffer: preprocess.keyframeDurationsBuffer } },
        { binding: 3, resource: { buffer: searchTimesBuffer } },
        { binding: 4, resource: { buffer: keyframeOffsetsBuffer } },
        { binding: 5, resource: { buffer: keyframeCountsBuffer } },
        { binding: 6, resource: { buffer: searchResultsBuffer } },
      ],
    });

    if (resolvedFrame) {
      const pass = resolvedFrame.beginComputePass();
      pass.setPipeline(entryExpandPipeline);
      pass.setBindGroup(0, entryExpandBindGroup);
      pass.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);

      if (
        indexedSearchEnabled &&
        !(await recordKeyframeSearchWindowPass({
          device,
          entryCount,
          preprocess,
          searchTimesBuffer,
          keyframeOffsetsBuffer,
          keyframeCountsBuffer,
          pass,
        }))
      ) {
        return null;
      }

      pass.setPipeline(searchPipeline);
      pass.setBindGroup(0, searchBindGroup);
      pass.dispatchWorkgroups(Math.ceil(entryCount / 64), 1, 1);

      return {
        searchResultsBuffer,
        searchResultsBufferPersistent: true,
        outputIndicesBuffer,
        outputIndicesBufferPersistent: true,
        entryCount,
      };
    }

    const cmdEncoder = device.createCommandEncoder({ label: 'motion-keyframe-search-encoder' });

    {
      const pass = cmdEncoder.beginComputePass();
      pass.setPipeline(entryExpandPipeline);
      pass.setBindGroup(0, entryExpandBindGroup);
      const workgroupsX = Math.ceil(entryCount / 64);
      pass.dispatchWorkgroups(workgroupsX, 1, 1);
      pass.end();
    }

    if (
      indexedSearchEnabled &&
      !(await recordKeyframeSearchWindowPass({
        device,
        cmdEncoder,
        entryCount,
        preprocess,
        searchTimesBuffer,
        keyframeOffsetsBuffer,
        keyframeCountsBuffer,
      }))
    ) {
      return null;
    }

    {
      const pass = cmdEncoder.beginComputePass();
      pass.setPipeline(searchPipeline);
      pass.setBindGroup(0, searchBindGroup);
      const workgroupsX = Math.ceil(entryCount / 64);
      pass.dispatchWorkgroups(workgroupsX, 1, 1);
      pass.end();
    }

    const commandBuffer = cmdEncoder.finish();
    if (resolvedSubmit) {
      resolvedSubmit(commandBuffer);
    } else {
      queue.submit([commandBuffer]);
    }

    return {
      searchResultsBuffer,
      searchResultsBufferPersistent: true,
      outputIndicesBuffer,
      outputIndicesBufferPersistent: true,
      entryCount,
    };
  } catch {
    return null;
  }
}
