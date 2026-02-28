/**
 * Keyframe Preprocess Pass
 *
 * GPU compute pass to pack raw keyframe data for efficient GPU processing.
 * Organizes keyframes into a format optimized for the search and interpolation passes.
 */

import type { KeyframePreprocessBatchDescriptor } from '@g-motion/shared';
import type { WebGPUFrameEncoder } from '../../command-encoder';
import {
  CHANNEL_MAP_STRIDE,
  PACKED_KEYFRAME_STRIDE,
  RAW_KEYFRAME_STRIDE,
} from '../../keyframe-preprocess-shader';
import { getGPUMetricsProvider } from '../../metrics-provider';
import { getPersistentGPUBufferManager } from '../../persistent-buffer-manager';
import { s_keyframePreprocessCPUCache } from './caches';
import { getKeyframePreprocessPipeline } from './pipelines';
import type { KeyframePreprocessResult } from './types';

const KEYFRAME_SEARCH_INDEX_BLOCK_SIZE = 8;

type KeyframeSearchIndexCacheEntry = {
  keyframesVersion: number;
  blockStartOffsets: Uint32Array;
  blockStartTimes: Float32Array;
};

const s_keyframeSearchIndexCache = new Map<string, KeyframeSearchIndexCacheEntry>();

export function __buildKeyframeSearchIndexForTests(params: {
  rawKeyframeData: Float32Array;
  mapData: Uint32Array;
}): { blockStartOffsets: Uint32Array; blockStartTimes: Float32Array } {
  const entryCount = params.mapData.length / CHANNEL_MAP_STRIDE;
  const blockStartOffsets = new Uint32Array(entryCount);
  let totalBlocks = 0;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const base = entryIndex * CHANNEL_MAP_STRIDE;
    const count = params.mapData[base + 3] ?? 0;
    blockStartOffsets[entryIndex] = totalBlocks;
    totalBlocks += Math.ceil(count / KEYFRAME_SEARCH_INDEX_BLOCK_SIZE);
  }

  const blockStartTimes = new Float32Array(Math.max(totalBlocks, 1));
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const base = entryIndex * CHANNEL_MAP_STRIDE;
    const entityOffset = params.mapData[base + 2] ?? 0;
    const count = params.mapData[base + 3] ?? 0;
    const blocks = Math.ceil(count / KEYFRAME_SEARCH_INDEX_BLOCK_SIZE);
    const outBase = blockStartOffsets[entryIndex] ?? 0;
    for (let b = 0; b < blocks; b++) {
      const kfIndex = entityOffset + b * KEYFRAME_SEARCH_INDEX_BLOCK_SIZE;
      blockStartTimes[outBase + b] = params.rawKeyframeData[kfIndex * RAW_KEYFRAME_STRIDE + 0] ?? 0;
    }
  }

  return { blockStartOffsets, blockStartTimes };
}

function getOrCreateKeyframeSearchIndex(params: {
  persistent: ReturnType<typeof getPersistentGPUBufferManager>;
  archetypeId: string;
  keyframesVersion: number;
  rawKeyframeData: Float32Array;
  mapData: Uint32Array;
}): { blockStartOffsetsBuffer: GPUBuffer; blockStartTimesBuffer: GPUBuffer } {
  const cacheKey = `${params.archetypeId}`;
  const cached = s_keyframeSearchIndexCache.get(cacheKey);
  const entryCount = params.mapData.length / CHANNEL_MAP_STRIDE;
  const needsRebuild =
    !cached ||
    cached.keyframesVersion !== params.keyframesVersion ||
    cached.blockStartOffsets.length !== entryCount;

  const index =
    needsRebuild || !cached
      ? __buildKeyframeSearchIndexForTests({
          rawKeyframeData: params.rawKeyframeData,
          mapData: params.mapData,
        })
      : cached;

  if (needsRebuild) {
    s_keyframeSearchIndexCache.set(cacheKey, {
      keyframesVersion: params.keyframesVersion,
      blockStartOffsets: index.blockStartOffsets,
      blockStartTimes: index.blockStartTimes,
    });
  }

  const blockStartOffsetsBuffer = params.persistent.getOrCreateBuffer(
    `keyframeSearchBlockStartOffsets:${params.archetypeId}`,
    index.blockStartOffsets,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    {
      label: `motion-keyframe-search-block-start-offsets-${params.archetypeId}`,
      allowGrowth: true,
      contentVersion: params.keyframesVersion,
    },
  );

  const blockStartTimesBuffer = params.persistent.getOrCreateBuffer(
    `keyframeSearchBlockStartTimes:${params.archetypeId}`,
    index.blockStartTimes,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    {
      label: `motion-keyframe-search-block-start-times-${params.archetypeId}`,
      allowGrowth: true,
      contentVersion: params.keyframesVersion,
    },
  );

  return { blockStartOffsetsBuffer, blockStartTimesBuffer };
}

export async function runKeyframePreprocessPass(
  device: GPUDevice,
  queue: GPUQueue,
  batch: KeyframePreprocessBatchDescriptor,
  frame?: WebGPUFrameEncoder,
  submit?: (commandBuffer: GPUCommandBuffer, afterSubmit?: () => void) => void,
  options?: {
    indexedSearchEnabled?: boolean;
    indexedSearchMinKeyframes?: number;
  },
): Promise<KeyframePreprocessResult | null> {
  const metrics = getGPUMetricsProvider();
  const preprocessed = batch.preprocessedKeyframes;
  if (!preprocessed) {
    return null;
  }
  const rawPerEntity = preprocessed.rawKeyframesPerEntity;
  const mapPerEntity = preprocessed.channelMapPerEntity;
  const clipModel = preprocessed.clipModel;
  const clipIndexByEntity = clipModel?.clipIndexByEntity;
  const rawByClip = clipModel?.rawKeyframesByClip;
  const mapByClip = clipModel?.channelMapByClip;
  const clipModelEnabled =
    !!clipIndexByEntity &&
    !!rawByClip &&
    !!mapByClip &&
    rawByClip.length > 0 &&
    mapByClip.length > 0 &&
    clipIndexByEntity.length > 0;

  let totalRawKeyframes = 0;
  let totalChannelMaps = 0;
  if (clipModelEnabled && rawByClip && mapByClip && clipIndexByEntity) {
    for (let c = 0; c < rawByClip.length; c++) {
      const raw = rawByClip[c];
      if (raw && raw.length) {
        totalRawKeyframes += raw.length / RAW_KEYFRAME_STRIDE;
      }
    }
    for (let e = 0; e < clipIndexByEntity.length; e++) {
      const clipIndex = clipIndexByEntity[e] ?? 0;
      const maps =
        clipIndex >= 0 && clipIndex < mapByClip.length ? mapByClip[clipIndex] : mapByClip[0];
      if (maps && maps.length) {
        totalChannelMaps += maps.length / CHANNEL_MAP_STRIDE;
      }
    }
  } else {
    if (!rawPerEntity.length || !mapPerEntity.length) {
      return null;
    }
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
  }

  if (!totalRawKeyframes || !totalChannelMaps) {
    return null;
  }

  const keyframesVersion = typeof batch.keyframesVersion === 'number' ? batch.keyframesVersion : 0;
  const hasKeyframesVersion = typeof batch.keyframesVersion === 'number';
  const indexedSearchEnabled =
    hasKeyframesVersion &&
    options?.indexedSearchEnabled === true &&
    totalRawKeyframes >= (options?.indexedSearchMinKeyframes ?? 64);

  const cpuStart = performance.now();

  const rawLen = totalRawKeyframes * RAW_KEYFRAME_STRIDE;
  const mapLen = totalChannelMaps * CHANNEL_MAP_STRIDE;

  let rawData: Float32Array;
  let mapData: Uint32Array;
  let entityIndexByEntry: Uint32Array;
  let channelIndexByEntry: Uint32Array;
  let rebuilt = true;

  if (hasKeyframesVersion) {
    const cacheKey = `${batch.archetypeId}`;
    const cached = s_keyframePreprocessCPUCache.get(cacheKey);
    const canReuse =
      !!cached &&
      cached.keyframesVersion === keyframesVersion &&
      cached.rawData.length === rawLen &&
      cached.mapData.length === mapLen &&
      cached.entityIndexByEntry.length === totalChannelMaps &&
      cached.channelIndexByEntry.length === totalChannelMaps;

    if (canReuse && cached) {
      rawData = cached.rawData;
      mapData = cached.mapData;
      entityIndexByEntry = cached.entityIndexByEntry;
      channelIndexByEntry = cached.channelIndexByEntry;
      rebuilt = false;
    } else {
      rawData =
        cached && cached.rawData.length === rawLen ? cached.rawData : new Float32Array(rawLen);
      mapData =
        cached && cached.mapData.length === mapLen ? cached.mapData : new Uint32Array(mapLen);
      entityIndexByEntry =
        cached && cached.entityIndexByEntry.length === totalChannelMaps
          ? cached.entityIndexByEntry
          : new Uint32Array(totalChannelMaps);
      channelIndexByEntry =
        cached && cached.channelIndexByEntry.length === totalChannelMaps
          ? cached.channelIndexByEntry
          : new Uint32Array(totalChannelMaps);

      if (clipModelEnabled && rawByClip && mapByClip && clipIndexByEntity) {
        const clipBaseOffsets = new Uint32Array(rawByClip.length);
        let rawBase = 0;
        for (let c = 0; c < rawByClip.length; c++) {
          clipBaseOffsets[c] = rawBase;
          const raw = rawByClip[c];
          const rawCount = raw.length ? raw.length / RAW_KEYFRAME_STRIDE : 0;
          if (rawCount) {
            rawData.set(raw, rawBase * RAW_KEYFRAME_STRIDE);
          }
          rawBase += rawCount;
        }

        let mapIndex = 0;
        for (let e = 0; e < clipIndexByEntity.length; e++) {
          const clipIndex = clipIndexByEntity[e] ?? 0;
          const validClipIndex = clipIndex >= 0 && clipIndex < mapByClip.length ? clipIndex : 0;
          const maps = mapByClip[validClipIndex];
          const clipBase = clipBaseOffsets[validClipIndex] ?? 0;
          const mapCount = maps.length ? maps.length / CHANNEL_MAP_STRIDE : 0;
          for (let j = 0; j < mapCount; j++) {
            const srcOffset = j * CHANNEL_MAP_STRIDE;
            const dstOffset = mapIndex * CHANNEL_MAP_STRIDE;
            const propertyHash = maps[srcOffset + 0];
            const channelIndex = maps[srcOffset + 1];
            const entityOffsetLocal = maps[srcOffset + 2];
            const keyframeCount = maps[srcOffset + 3];
            mapData[dstOffset + 0] = propertyHash;
            mapData[dstOffset + 1] = channelIndex;
            mapData[dstOffset + 2] = entityOffsetLocal + clipBase;
            mapData[dstOffset + 3] = keyframeCount;
            entityIndexByEntry[mapIndex] = e;
            channelIndexByEntry[mapIndex] = channelIndex;
            mapIndex++;
          }
        }
      } else {
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
      }

      s_keyframePreprocessCPUCache.set(cacheKey, {
        keyframesVersion,
        rawData,
        mapData,
        entityIndexByEntry,
        channelIndexByEntry,
      });
    }
  } else {
    rawData = new Float32Array(rawLen);
    mapData = new Uint32Array(mapLen);
    entityIndexByEntry = new Uint32Array(totalChannelMaps);
    channelIndexByEntry = new Uint32Array(totalChannelMaps);

    if (clipModelEnabled && rawByClip && mapByClip && clipIndexByEntity) {
      const clipBaseOffsets = new Uint32Array(rawByClip.length);
      let rawBase = 0;
      for (let c = 0; c < rawByClip.length; c++) {
        clipBaseOffsets[c] = rawBase;
        const raw = rawByClip[c];
        const rawCount = raw.length ? raw.length / RAW_KEYFRAME_STRIDE : 0;
        if (rawCount) {
          rawData.set(raw, rawBase * RAW_KEYFRAME_STRIDE);
        }
        rawBase += rawCount;
      }

      let mapIndex = 0;
      for (let e = 0; e < clipIndexByEntity.length; e++) {
        const clipIndex = clipIndexByEntity[e] ?? 0;
        const validClipIndex = clipIndex >= 0 && clipIndex < mapByClip.length ? clipIndex : 0;
        const maps = mapByClip[validClipIndex];
        const clipBase = clipBaseOffsets[validClipIndex] ?? 0;
        const mapCount = maps.length ? maps.length / CHANNEL_MAP_STRIDE : 0;
        for (let j = 0; j < mapCount; j++) {
          const srcOffset = j * CHANNEL_MAP_STRIDE;
          const dstOffset = mapIndex * CHANNEL_MAP_STRIDE;
          const propertyHash = maps[srcOffset + 0];
          const channelIndex = maps[srcOffset + 1];
          const entityOffsetLocal = maps[srcOffset + 2];
          const keyframeCount = maps[srcOffset + 3];
          mapData[dstOffset + 0] = propertyHash;
          mapData[dstOffset + 1] = channelIndex;
          mapData[dstOffset + 2] = entityOffsetLocal + clipBase;
          mapData[dstOffset + 3] = keyframeCount;
          entityIndexByEntry[mapIndex] = e;
          channelIndexByEntry[mapIndex] = channelIndex;
          mapIndex++;
        }
      }
    } else {
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
    }
  }

  const cpuDuration = performance.now() - cpuStart;
  metrics.recordSystemTiming?.('keyframe-preprocess-cpu', cpuDuration);
  if (rebuilt) {
    metrics.recordSystemTiming?.('keyframe-preprocess-cpu-rebuild', cpuDuration);
  } else {
    metrics.recordSystemTiming?.('keyframe-preprocess-cpu-skip', 0);
  }

  const persistent = getPersistentGPUBufferManager(device);

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

  const entityIndexByEntryBuffer = persistent.getOrCreateBuffer(
    `keyframePreprocessEntityIndexByEntry:${batch.archetypeId}`,
    entityIndexByEntry,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    {
      label: `motion-keyframe-entity-index-by-entry-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  const channelIndexByEntryBuffer = persistent.getOrCreateBuffer(
    `keyframePreprocessChannelIndexByEntry:${batch.archetypeId}`,
    channelIndexByEntry,
    (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    {
      label: `motion-keyframe-channel-index-by-entry-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

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

  const startTimesKey = `keyframePreprocessStartTimes:${batch.archetypeId}`;
  const startTimesRes = persistent.getOrCreateEmptyBuffer(
    startTimesKey,
    totalRawKeyframes * 4,
    GPUBufferUsage.STORAGE as number,
    {
      label: `motion-keyframe-start-times-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  const durationsKey = `keyframePreprocessDurations:${batch.archetypeId}`;
  const durationsRes = persistent.getOrCreateEmptyBuffer(
    durationsKey,
    totalRawKeyframes * 4,
    GPUBufferUsage.STORAGE as number,
    {
      label: `motion-keyframe-durations-${batch.archetypeId}`,
      allowGrowth: true,
      contentVersion: batch.keyframesVersion,
    },
  );

  if (packedRes.upToDate && startTimesRes.upToDate && durationsRes.upToDate) {
    const indexRes = indexedSearchEnabled
      ? getOrCreateKeyframeSearchIndex({
          persistent,
          archetypeId: batch.archetypeId,
          keyframesVersion,
          rawKeyframeData: rawData,
          mapData,
        })
      : null;
    return {
      packedKeyframesBuffer: packedRes.buffer,
      keyframeStartTimesBuffer: startTimesRes.buffer,
      keyframeDurationsBuffer: durationsRes.buffer,
      rawKeyframeData: rawData,
      mapData,
      entityIndexByEntry,
      channelIndexByEntry,
      channelMapsBuffer,
      entityIndexByEntryBuffer,
      channelIndexByEntryBuffer,
      blockStartOffsetsBuffer: indexRes?.blockStartOffsetsBuffer,
      blockStartTimesBuffer: indexRes?.blockStartTimesBuffer,
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

  const packedKeyframesBuffer = packedRes.buffer;

  const keyframeIndicesBuffer = device.createBuffer({
    size: Math.max(totalRawKeyframes * 4, 4),
    usage: GPUBufferUsage.STORAGE as number,
    mappedAtCreation: false,
    label: `motion-keyframe-indices-${batch.archetypeId}`,
  });

  const pipelineState = await getKeyframePreprocessPipeline(device);
  if (!pipelineState) {
    keyframeIndicesBuffer.destroy();
    return null;
  }

  const { pipeline, bindGroupLayout } = pipelineState;
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: rawKeyframesBuffer } },
      { binding: 1, resource: { buffer: channelMapsBuffer } },
      { binding: 2, resource: { buffer: packedKeyframesBuffer } },
      { binding: 3, resource: { buffer: keyframeIndicesBuffer } },
      { binding: 4, resource: { buffer: startTimesRes.buffer } },
      { binding: 5, resource: { buffer: durationsRes.buffer } },
    ],
  });

  const workgroupsX = Math.ceil(totalRawKeyframes / 64);

  if (frame) {
    const pass = frame.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupsX, 1, 1);
    frame.recordAfterSubmit(() => {
      keyframeIndicesBuffer.destroy();
    });
  } else {
    const cmdEncoder = device.createCommandEncoder({
      label: `motion-keyframe-preprocess-encoder-${batch.archetypeId}`,
    });
    const pass = cmdEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupsX, 1, 1);
    pass.end();
    const commandBuffer = cmdEncoder.finish();
    if (submit) {
      submit(commandBuffer, () => {
        keyframeIndicesBuffer.destroy();
      });
    } else {
      queue.submit([commandBuffer]);
      keyframeIndicesBuffer.destroy();
    }
  }
  persistent.markBufferClean(packedKey, batch.keyframesVersion);
  persistent.markBufferClean(startTimesKey, batch.keyframesVersion);
  persistent.markBufferClean(durationsKey, batch.keyframesVersion);

  const indexRes = indexedSearchEnabled
    ? getOrCreateKeyframeSearchIndex({
        persistent,
        archetypeId: batch.archetypeId,
        keyframesVersion,
        rawKeyframeData: rawData,
        mapData,
      })
    : null;

  return {
    packedKeyframesBuffer,
    keyframeStartTimesBuffer: startTimesRes.buffer,
    keyframeDurationsBuffer: durationsRes.buffer,
    rawKeyframeData: rawData,
    mapData,
    entityIndexByEntry,
    channelIndexByEntry,
    channelMapsBuffer,
    entityIndexByEntryBuffer,
    channelIndexByEntryBuffer,
    blockStartOffsetsBuffer: indexRes?.blockStartOffsetsBuffer,
    blockStartTimesBuffer: indexRes?.blockStartTimesBuffer,
  };
}
