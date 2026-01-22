/**
 * Keyframe Interpolation Pass
 *
 * GPU compute pass to interpolate animation values from keyframe search results.
 * Takes active keyframe indices and computes interpolated values for each
 * entity/channel combination.
 */

import type { WebGPUFrameEncoder } from '../../command-encoder';
import { CHANNEL_MAP_STRIDE, RAW_KEYFRAME_STRIDE } from '../../keyframe-preprocess-shader';
import { getPersistentGPUBufferManager } from '../../persistent-buffer-manager';
import { tryRunKeyframeInterpPassWithGpuEntryExpand } from './interp-pass-gpu-expand';
import type { KeyframePreprocessResult } from './types';

export async function runKeyframeInterpPass(
  device: GPUDevice,
  queue: GPUQueue,
  archetypeId: string,
  preprocess: KeyframePreprocessResult,
  statesData: Float32Array,
  channelCount: number,
  entityCount: number,
  useOptimizedSearch: boolean,
  persistentOverride?: ReturnType<typeof getPersistentGPUBufferManager>,
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
  options?: {
    entryExpansionOnGPUEnabled?: boolean;
    indexedSearchEnabled?: boolean;
    indexedSearchMinKeyframes?: number;
    statesVersion?: number;
    statesConditionalUploadEnabled?: boolean;
    forceStatesUploadEnabled?: boolean;
    reuseOutputBuffer?: boolean;
  },
): Promise<{ outputBuffer: GPUBuffer; outputBufferTag?: unknown } | null> {
  const rawCount = preprocess.rawKeyframeData.length / RAW_KEYFRAME_STRIDE;
  const entryCount = preprocess.mapData.length / CHANNEL_MAP_STRIDE;
  if (!rawCount || !entryCount || !entityCount || !channelCount) {
    return null;
  }

  const indexedSearchEnabled =
    options?.indexedSearchEnabled === true &&
    rawCount >= (options?.indexedSearchMinKeyframes ?? 64) &&
    !!preprocess.blockStartOffsetsBuffer &&
    !!preprocess.blockStartTimesBuffer;

  const entryExpansionOnGPUEnabled = options?.entryExpansionOnGPUEnabled !== false;
  if (entryExpansionOnGPUEnabled) {
    const expanded = await tryRunKeyframeInterpPassWithGpuEntryExpand({
      device,
      queue,
      archetypeId,
      preprocess,
      statesData,
      channelCount,
      entityCount,
      entryCount,
      useOptimizedSearch,
      indexedSearchEnabled,
      persistentOverride,
      frame,
      submit,
      options: {
        reuseOutputBuffer: options?.reuseOutputBuffer,
        statesVersion: options?.statesVersion,
        statesConditionalUploadEnabled: options?.statesConditionalUploadEnabled,
        forceStatesUploadEnabled: options?.forceStatesUploadEnabled,
      },
    });
    if (expanded) {
      return expanded;
    }
  }
  return null;
}
