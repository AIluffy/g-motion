/**
 * Keyframe Pipeline Management
 *
 * Caches and initializes GPU compute pipelines for keyframe operations:
 * - Preprocess pipeline: Packs raw keyframes for GPU
 * - Search pipeline: Finds active keyframes for current time
 * - Interp pipeline: Interpolates values from search results
 */

import { createDebugger } from '@g-motion/utils';
import {
  KEYFRAME_ENTRY_EXPAND_SHADER,
  KEYFRAME_INTERP_FROM_SEARCH_SHADER,
  KEYFRAME_PREPROCESS_SHADER,
  KEYFRAME_SEARCH_SHADER,
  KEYFRAME_SEARCH_SHADER_OPT,
  KEYFRAME_SEARCH_WINDOW_SHADER,
} from '../../keyframe-preprocess-shader';
import { __resetKeyframePreprocessCPUCacheForTests } from './caches';

type KeyframePipelineState = {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
};

type KeyframePipelineCache = {
  preprocess?: KeyframePipelineState;
  entryExpand?: KeyframePipelineState;
  searchWindow?: KeyframePipelineState;
  search?: KeyframePipelineState & { optimized: boolean };
  interp?: KeyframePipelineState;
};

let keyframePipelineCache = new WeakMap<GPUDevice, KeyframePipelineCache>();
let lastSearchOptimizedInUse: boolean | null = null;
const debug = createDebugger('WebGPU');

// Test utilities
export function __getKeyframeSearchShaderModeForTests(): boolean | null {
  return lastSearchOptimizedInUse;
}

export function clearKeyframePipelineCache(device: GPUDevice): void {
  keyframePipelineCache.delete(device);
}

export function __resetKeyframePassesForTests(): void {
  keyframePipelineCache = new WeakMap();
  lastSearchOptimizedInUse = null;
  __resetKeyframePreprocessCPUCacheForTests();
}

function getKeyframeCache(device: GPUDevice): KeyframePipelineCache {
  const existing = keyframePipelineCache.get(device);
  if (existing) return existing;
  const cache: KeyframePipelineCache = {};
  keyframePipelineCache.set(device, cache);
  return cache;
}

export async function getKeyframePreprocessPipeline(
  device: GPUDevice,
): Promise<KeyframePipelineState | null> {
  const cache = getKeyframeCache(device);
  if (cache.preprocess) {
    return cache.preprocess;
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
      { binding: 4, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'storage' as const } },
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

  const state = { pipeline, bindGroupLayout };
  cache.preprocess = state;
  return state;
}

export async function getKeyframeEntryExpandPipeline(
  device: GPUDevice,
): Promise<KeyframePipelineState | null> {
  const cache = getKeyframeCache(device);
  if (cache.entryExpand) {
    return cache.entryExpand;
  }

  const shaderModule = device.createShaderModule({
    code: KEYFRAME_ENTRY_EXPAND_SHADER,
    label: 'motion-keyframe-entry-expand-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-entry-expand-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 4, visibility: 4, buffer: { type: 'uniform' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 6, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 7, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 8, visibility: 4, buffer: { type: 'storage' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-entry-expand-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-keyframe-entry-expand-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'expandEntries' },
  });

  const state = { pipeline, bindGroupLayout };
  cache.entryExpand = state;
  return state;
}

export async function getKeyframeSearchWindowPipeline(
  device: GPUDevice,
): Promise<KeyframePipelineState | null> {
  const cache = getKeyframeCache(device);
  if (cache.searchWindow) {
    return cache.searchWindow;
  }

  const shaderModule = device.createShaderModule({
    code: KEYFRAME_SEARCH_WINDOW_SHADER,
    label: 'motion-keyframe-search-window-shader',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'motion-keyframe-search-window-bgl',
    entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 4, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'storage' as const } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'motion-keyframe-search-window-pl',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    label: 'motion-keyframe-search-window-pipeline',
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: 'computeSearchWindow' },
  });

  const state = { pipeline, bindGroupLayout };
  cache.searchWindow = state;
  return state;
}

export async function getKeyframeSearchPipeline(
  device: GPUDevice,
  useOptimizedShader: boolean,
): Promise<KeyframePipelineState | null> {
  const cache = getKeyframeCache(device);
  if (cache.search && cache.search.optimized === useOptimizedShader) {
    lastSearchOptimizedInUse = cache.search.optimized;
    return cache.search;
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
      { binding: 4, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 6, visibility: 4, buffer: { type: 'storage' as const } },
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

  const state = { pipeline, bindGroupLayout, optimized: useOptimizedShader };
  cache.search = state;
  lastSearchOptimizedInUse = useOptimizedShader;
  try {
    const mode = useOptimizedShader ? 'optimized' : 'baseline';
    debug('keyframe search shader mode', mode);
  } catch {}
  return state;
}

export async function getKeyframeInterpPipeline(
  device: GPUDevice,
): Promise<KeyframePipelineState | null> {
  const cache = getKeyframeCache(device);
  if (cache.interp) {
    return cache.interp;
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
      { binding: 3, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 4, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 5, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 6, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 7, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 8, visibility: 4, buffer: { type: 'uniform' as const } },
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

  const state = { pipeline, bindGroupLayout };
  cache.interp = state;
  return state;
}
