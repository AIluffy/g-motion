/**
 * Keyframe Preprocess Pass
 *
 * GPU compute pass to pack raw keyframe data for efficient GPU processing.
 * Organizes keyframes into a format optimized for the search and interpolation passes.
 */

import type { ArchetypeBatchDescriptor } from '../../../types';
import {
  CHANNEL_MAP_STRIDE,
  PACKED_KEYFRAME_STRIDE,
  RAW_KEYFRAME_STRIDE,
} from '../../../webgpu/keyframe-preprocess-shader';
import { getPersistentGPUBufferManager } from '../../../webgpu/persistent-buffer-manager';
import { getKeyframePreprocessPipeline, keyframePreprocessBindGroupLayout } from './pipelines';
import type { KeyframePreprocessResult } from './types';

export async function runKeyframePreprocessPass(
  device: GPUDevice,
  queue: GPUQueue,
  batch: ArchetypeBatchDescriptor,
): Promise<KeyframePreprocessResult | null> {
  const preprocessed = batch.preprocessedKeyframes;
  if (!preprocessed) {
    return null;
  }
  const rawPerEntity = preprocessed.rawKeyframesPerEntity;
  const mapPerEntity = preprocessed.channelMapPerEntity;
  if (!rawPerEntity.length || !mapPerEntity.length) {
    return null;
  }

  let totalRawKeyframes = 0;
  let totalChannelMaps = 0;
  for (let i = 0; i < rawPerEntity.length; i++) {
    const raw = rawPerEntity[i];
    const maps = mapPerEntity[i];
    if (raw && raw.length) {
      totalRawKeyframes += raw.length / RAW_KEYFRAME_STRIDE;
    }
    if (maps && maps.length) {
      totalChannelMaps += maps.length / CHANNEL_MAP_STRIDE;
    }
  }

  if (!totalRawKeyframes || !totalChannelMaps) {
    return null;
  }

  const rawData = new Float32Array(totalRawKeyframes * RAW_KEYFRAME_STRIDE);
  const mapData = new Uint32Array(totalChannelMaps * CHANNEL_MAP_STRIDE);
  const entityIndexByEntry = new Uint32Array(totalChannelMaps);
  const channelIndexByEntry = new Uint32Array(totalChannelMaps);

  let rawBase = 0;
  let mapIndex = 0;

  for (let i = 0; i < rawPerEntity.length; i++) {
    const raw = rawPerEntity[i];
    const maps = mapPerEntity[i];
    const rawCount = raw.length ? raw.length / RAW_KEYFRAME_STRIDE : 0;
    const mapCount = maps.length ? maps.length / CHANNEL_MAP_STRIDE : 0;

    if (rawCount) {
      rawData.set(raw, rawBase * RAW_KEYFRAME_STRIDE);
    }

    for (let j = 0; j < mapCount; j++) {
      const srcOffset = j * CHANNEL_MAP_STRIDE;
      const dstOffset = mapIndex * CHANNEL_MAP_STRIDE;
      const propertyHash = maps[srcOffset + 0];
      const channelIndex = maps[srcOffset + 1];
      const entityOffsetLocal = maps[srcOffset + 2];
      const keyframeCount = maps[srcOffset + 3];
      mapData[dstOffset + 0] = propertyHash;
      mapData[dstOffset + 1] = channelIndex;
      mapData[dstOffset + 2] = entityOffsetLocal + rawBase;
      mapData[dstOffset + 3] = keyframeCount;
      entityIndexByEntry[mapIndex] = i;
      channelIndexByEntry[mapIndex] = channelIndex;
      mapIndex++;
    }

    rawBase += rawCount;
  }

  const persistent = getPersistentGPUBufferManager(device);
  const packedKey = `keyframePreprocessPacked:${batch.archetypeId}`;
  const packedBytes = totalRawKeyframes * PACKED_KEYFRAME_STRIDE * 4;
  const packedRes = persistent.getOrCreateEmptyBuffer(
    packedKey,
    packedBytes,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    {
      label: `motion-packed-keyframes-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  if (packedRes.upToDate) {
    return {
      packedKeyframesBuffer: packedRes.buffer,
      rawKeyframeData: rawData,
      mapData,
      entityIndexByEntry,
      channelIndexByEntry,
    };
  }

  const rawKeyframesBuffer = persistent.getOrCreateBuffer(
    `keyframePreprocessRaw:${batch.archetypeId}`,
    rawData,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    {
      label: `motion-raw-keyframes-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  const channelMapsBuffer = persistent.getOrCreateBuffer(
    `keyframePreprocessMaps:${batch.archetypeId}`,
    mapData,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    {
      label: `motion-channel-maps-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  const packedKeyframesBuffer = packedRes.buffer;

  const keyframeIndicesBuffer = device.createBuffer({
    size: Math.max(totalRawKeyframes * 4, 4),
    usage: GPUBufferUsage.STORAGE as number,
    mappedAtCreation: false,
    label: `motion-keyframe-indices-${batch.archetypeId}`,
  });

  const pipeline = await getKeyframePreprocessPipeline(device);
  if (!pipeline || !keyframePreprocessBindGroupLayout) {
    keyframeIndicesBuffer.destroy();
    return null;
  }

  const bindGroupLayout = keyframePreprocessBindGroupLayout;
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: rawKeyframesBuffer } },
      { binding: 1, resource: { buffer: channelMapsBuffer } },
      { binding: 2, resource: { buffer: packedKeyframesBuffer } },
      { binding: 3, resource: { buffer: keyframeIndicesBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-keyframe-preprocess-encoder-${batch.archetypeId}`,
  });
  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupsX = Math.ceil(totalRawKeyframes / 64);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();
  queue.submit([cmdEncoder.finish()]);

  keyframeIndicesBuffer.destroy();
  persistent.markBufferClean(packedKey, batch.keyframesVersion);

  return {
    packedKeyframesBuffer,
    rawKeyframeData: rawData,
    mapData,
    entityIndexByEntry,
    channelIndexByEntry,
  };
}
