/**
 * Keyframe Pipeline Management
 *
 * Caches and initializes GPU compute pipelines for keyframe operations:
 * - Preprocess pipeline: Packs raw keyframes for GPU
 * - Search pipeline: Finds active keyframes for current time
 * - Interp pipeline: Interpolates values from search results
 */

import {
  KEYFRAME_INTERP_FROM_SEARCH_SHADER,
  KEYFRAME_PREPROCESS_SHADER,
  KEYFRAME_SEARCH_SHADER,
  KEYFRAME_SEARCH_SHADER_OPT,
} from '../../../webgpu/keyframe-preprocess-shader';
import { createDebugger } from '@g-motion/utils';

// Pipeline cache (exported for use by pass files)
export let keyframePreprocessPipeline: GPUComputePipeline | null = null;
export let keyframePreprocessBindGroupLayout: GPUBindGroupLayout | null = null;
export let keyframeSearchPipeline: GPUComputePipeline | null = null;
export let keyframeSearchBindGroupLayout: GPUBindGroupLayout | null = null;
export let keyframeInterpPipeline: GPUComputePipeline | null = null;
export let keyframeInterpBindGroupLayout: GPUBindGroupLayout | null = null;

let keyframeSearchOptimizedInUse: boolean | null = null;
const debug = createDebugger('WebGPU');

// Test utilities
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

export async function getKeyframePreprocessPipeline(
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

export async function getKeyframeSearchPipeline(
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
    debug('keyframe search shader mode', mode);
  } catch {}
  return pipeline;
}

export async function getKeyframeInterpPipeline(
  device: GPUDevice,
): Promise<GPUComputePipeline | null> {
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
