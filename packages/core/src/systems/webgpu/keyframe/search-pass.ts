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
import { getKeyframeSearchPipeline, keyframeSearchBindGroupLayout } from './pipelines';
import type { KeyframePreprocessResult, KeyframeSearchResultGPU } from './types';

export async function runKeyframeSearchPass(
  device: GPUDevice,
  queue: GPUQueue,
  preprocess: KeyframePreprocessResult,
  statesData: Float32Array,
  channelCount: number,
  useOptimizedShader: boolean,
): Promise<KeyframeSearchResultGPU | null> {
  const rawCount = preprocess.rawKeyframeData.length / RAW_KEYFRAME_STRIDE;
  const entryCount = preprocess.mapData.length / CHANNEL_MAP_STRIDE;
  if (!rawCount || !entryCount) {
    return null;
  }

  const keyframeOffsets = new Uint32Array(entryCount);
  const keyframeCounts = new Uint32Array(entryCount);
  const searchTimes = new Float32Array(entryCount);
  const outputIndicesData = new Uint32Array(entryCount);

  for (let j = 0; j < entryCount; j++) {
    const base = j * CHANNEL_MAP_STRIDE;
    keyframeOffsets[j] = preprocess.mapData[base + 2];
    keyframeCounts[j] = preprocess.mapData[base + 3];

    const entityIndex = preprocess.entityIndexByEntry[j] >>> 0;
    const channelIndex = preprocess.channelIndexByEntry[j] >>> 0;

    const stateOffset = entityIndex * 4;
    const currentTime = statesData[stateOffset + 1] ?? 0;
    const playbackRate = statesData[stateOffset + 2] ?? 0;
    const adjustedTime = currentTime * playbackRate;

    searchTimes[j] = adjustedTime;
    outputIndicesData[j] = entityIndex * channelCount + channelIndex;
  }

  const searchTimesBuffer = device.createBuffer({
    size: searchTimes.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-times',
  });

  const keyframeOffsetsBuffer = device.createBuffer({
    size: keyframeOffsets.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-offsets',
  });

  const keyframeCountsBuffer = device.createBuffer({
    size: keyframeCounts.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-counts',
  });

  const searchResultsBuffer = device.createBuffer({
    size: entryCount * SEARCH_RESULT_STRIDE * 4,
    usage: GPUBufferUsage.STORAGE as number,
    mappedAtCreation: false,
    label: 'motion-keyframe-search-results',
  });

  queue.writeBuffer(
    searchTimesBuffer,
    0,
    searchTimes.buffer as ArrayBuffer,
    0,
    searchTimes.byteLength,
  );
  queue.writeBuffer(
    keyframeOffsetsBuffer,
    0,
    keyframeOffsets.buffer as ArrayBuffer,
    0,
    keyframeOffsets.byteLength,
  );
  queue.writeBuffer(
    keyframeCountsBuffer,
    0,
    keyframeCounts.buffer as ArrayBuffer,
    0,
    keyframeCounts.byteLength,
  );

  const pipeline = await getKeyframeSearchPipeline(device, useOptimizedShader);
  if (!pipeline || !keyframeSearchBindGroupLayout) {
    searchTimesBuffer.destroy();
    keyframeOffsetsBuffer.destroy();
    keyframeCountsBuffer.destroy();
    searchResultsBuffer.destroy();
    return null;
  }

  const bindGroupLayout = keyframeSearchBindGroupLayout;
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: preprocess.packedKeyframesBuffer } },
      { binding: 1, resource: { buffer: searchTimesBuffer } },
      { binding: 2, resource: { buffer: keyframeOffsetsBuffer } },
      { binding: 3, resource: { buffer: keyframeCountsBuffer } },
      { binding: 4, resource: { buffer: searchResultsBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({ label: 'motion-keyframe-search-encoder' });
  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupsX = Math.ceil(entryCount / 64);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();
  queue.submit([cmdEncoder.finish()]);

  searchTimesBuffer.destroy();
  keyframeOffsetsBuffer.destroy();
  keyframeCountsBuffer.destroy();

  return {
    searchResultsBuffer,
    outputIndicesData,
    entryCount,
  };
}
