import type { ArchetypeBatchDescriptor } from '../../types';
import {
  CHANNEL_MAP_STRIDE,
  KEYFRAME_INTERP_FROM_SEARCH_SHADER,
  KEYFRAME_PREPROCESS_SHADER,
  KEYFRAME_SEARCH_SHADER,
  KEYFRAME_SEARCH_SHADER_OPT,
  PACKED_KEYFRAME_STRIDE,
  RAW_KEYFRAME_STRIDE,
  SEARCH_RESULT_STRIDE,
} from '../../webgpu/keyframe-preprocess-shader';

let keyframePreprocessPipeline: GPUComputePipeline | null = null;
let keyframePreprocessBindGroupLayout: GPUBindGroupLayout | null = null;
let keyframeSearchPipeline: GPUComputePipeline | null = null;
let keyframeSearchBindGroupLayout: GPUBindGroupLayout | null = null;
let keyframeInterpPipeline: GPUComputePipeline | null = null;
let keyframeInterpBindGroupLayout: GPUBindGroupLayout | null = null;

let keyframeSearchOptimizedInUse: boolean | null = null;

export function __getKeyframeSearchShaderModeForTests(): boolean | null {
  return keyframeSearchOptimizedInUse;
}

export function __resetKeyframePassesForTests(): void {
  keyframePreprocessPipeline = null;
  keyframePreprocessBindGroupLayout = null;
  keyframeSearchPipeline = null;
  keyframeSearchBindGroupLayout = null;
  keyframeInterpPipeline = null;
  keyframeInterpBindGroupLayout = null;
  keyframeSearchOptimizedInUse = null;
}

async function getKeyframePreprocessPipeline(
  device: GPUDevice,
): Promise<GPUComputePipeline | null> {
  if (keyframePreprocessPipeline && keyframePreprocessBindGroupLayout) {
    return keyframePreprocessPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: KEYFRAME_PREPROCESS_SHADER,
    label: 'motion-keyframe-preprocess-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-preprocess-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'storage' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-preprocess-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-keyframe-preprocess-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'packKeyframes' },
  });

  keyframePreprocessBindGroupLayout = bindGroupLayout;
  keyframePreprocessPipeline = pipeline;
  return pipeline;
}

async function getKeyframeSearchPipeline(
  device: GPUDevice,
  useOptimizedShader: boolean,
): Promise<GPUComputePipeline | null> {
  if (keyframeSearchPipeline && keyframeSearchBindGroupLayout) {
    return keyframeSearchPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: useOptimizedShader ? KEYFRAME_SEARCH_SHADER_OPT : KEYFRAME_SEARCH_SHADER,
    label: useOptimizedShader
      ? 'motion-keyframe-search-shader-opt'
      : 'motion-keyframe-search-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-search-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 4, visibility: 4, buffer: { type: 'storage' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-search-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: useOptimizedShader
      ? 'motion-keyframe-search-pipeline-opt'
      : 'motion-keyframe-search-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'findActiveKeyframes' },
  });

  keyframeSearchBindGroupLayout = bindGroupLayout;
  keyframeSearchPipeline = pipeline;
  keyframeSearchOptimizedInUse = useOptimizedShader;
  try {
    const mode = useOptimizedShader ? 'optimized' : 'baseline';
    console.info('[Motion][WebGPUComputeSystem] keyframe search shader mode', mode);
  } catch {}
  return pipeline;
}

async function getKeyframeInterpPipeline(device: GPUDevice): Promise<GPUComputePipeline | null> {
  if (keyframeInterpPipeline && keyframeInterpBindGroupLayout) {
    return keyframeInterpPipeline;
  }

  const shaderModule = device.createShaderModule({
    code: KEYFRAME_INTERP_FROM_SEARCH_SHADER,
    label: 'motion-keyframe-interp-from-search-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-interp-from-search-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'storage' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-interp-from-search-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-keyframe-interp-from-search-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'interpolateFromSearch' },
  });

  keyframeInterpBindGroupLayout = bindGroupLayout;
  keyframeInterpPipeline = pipeline;
  return pipeline;
}

interface KeyframePreprocessResult {
  packedKeyframesBuffer: GPUBuffer;
  rawKeyframeData: Float32Array;
  mapData: Uint32Array;
  entityIndexByEntry: Uint32Array;
  channelIndexByEntry: Uint32Array;
}

interface KeyframeSearchResultGPU {
  searchResultsBuffer: GPUBuffer;
  outputIndicesData: Uint32Array;
  entryCount: number;
}

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

  const bindGroup = device.createBindGroup({
    layout: keyframeSearchBindGroupLayout,
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

export async function runKeyframeInterpPass(
  device: GPUDevice,
  queue: GPUQueue,
  packedKeyframesBuffer: GPUBuffer,
  searchResultsBuffer: GPUBuffer,
  outputIndicesData: Uint32Array,
  entryCount: number,
  entityCount: number,
  channelCount: number,
  archetypeId: string,
): Promise<GPUBuffer | null> {
  if (!entryCount || !entityCount || !channelCount) {
    packedKeyframesBuffer.destroy();
    searchResultsBuffer.destroy();
    return null;
  }

  const outputIndicesBuffer = device.createBuffer({
    size: outputIndicesData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-keyframe-interp-output-indices-${archetypeId}`,
  });

  const outputsSize = entityCount * channelCount * 4;
  const outputBuffer = device.createBuffer({
    size: outputsSize,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-keyframe-interp-outputs-${archetypeId}`,
  });

  queue.writeBuffer(
    outputIndicesBuffer,
    0,
    outputIndicesData.buffer as ArrayBuffer,
    0,
    outputIndicesData.byteLength,
  );

  const pipeline = await getKeyframeInterpPipeline(device);
  if (!pipeline || !keyframeInterpBindGroupLayout) {
    packedKeyframesBuffer.destroy();
    searchResultsBuffer.destroy();
    outputIndicesBuffer.destroy();
    outputBuffer.destroy();
    return null;
  }

  const bindGroup = device.createBindGroup({
    layout: keyframeInterpBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: packedKeyframesBuffer } },
      { binding: 1, resource: { buffer: searchResultsBuffer } },
      { binding: 2, resource: { buffer: outputIndicesBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
    ],
  });

  const cmdEncoder = device.createCommandEncoder({
    label: `motion-keyframe-interp-encoder-${archetypeId}`,
  });
  const pass = cmdEncoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const workgroupsX = Math.ceil(entryCount / 64);
  pass.dispatchWorkgroups(workgroupsX, 1, 1);
  pass.end();
  queue.submit([cmdEncoder.finish()]);

  packedKeyframesBuffer.destroy();
  searchResultsBuffer.destroy();
  outputIndicesBuffer.destroy();

  return outputBuffer;
}

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

  const rawKeyframesBuffer = device.createBuffer({
    size: rawData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-raw-keyframes-${batch.archetypeId}`,
  });

  const channelMapsBuffer = device.createBuffer({
    size: mapData.byteLength,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST) as number,
    mappedAtCreation: false,
    label: `motion-channel-maps-${batch.archetypeId}`,
  });

  const packedKeyframesBuffer = device.createBuffer({
    size: totalRawKeyframes * PACKED_KEYFRAME_STRIDE * 4,
    usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC) as number,
    mappedAtCreation: false,
    label: `motion-packed-keyframes-${batch.archetypeId}`,
  });

  const keyframeIndicesBuffer = device.createBuffer({
    size: Math.max(totalRawKeyframes * 4, 4),
    usage: GPUBufferUsage.STORAGE as number,
    mappedAtCreation: false,
    label: `motion-keyframe-indices-${batch.archetypeId}`,
  });

  queue.writeBuffer(rawKeyframesBuffer, 0, rawData.buffer as ArrayBuffer, 0, rawData.byteLength);
  queue.writeBuffer(channelMapsBuffer, 0, mapData.buffer as ArrayBuffer, 0, mapData.byteLength);

  const pipeline = await getKeyframePreprocessPipeline(device);
  if (!pipeline || !keyframePreprocessBindGroupLayout) {
    rawKeyframesBuffer.destroy();
    channelMapsBuffer.destroy();
    packedKeyframesBuffer.destroy();
    keyframeIndicesBuffer.destroy();
    return null;
  }

  const bindGroup = device.createBindGroup({
    layout: keyframePreprocessBindGroupLayout,
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

  rawKeyframesBuffer.destroy();
  channelMapsBuffer.destroy();
  keyframeIndicesBuffer.destroy();

  return {
    packedKeyframesBuffer,
    rawKeyframeData: rawData,
    mapData,
    entityIndexByEntry,
    channelIndexByEntry,
  };
}
