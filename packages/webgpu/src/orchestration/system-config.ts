import type { NormalizedMotionAppConfig } from '@g-motion/core/runtime';

export type WebGPUReadbackMode = 'full' | 'visible';

export function isWebGPUIODebugEnabled(config: NormalizedMotionAppConfig | undefined): boolean {
  return config?.debug?.webgpuIO === true;
}

export function isWebGPUViewportCullingEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  const culling = config?.webgpu?.culling;
  if (culling) {
    if (culling.enabled === true && culling.viewport !== false) return true;
    if (culling.viewport === true) return true;
  }
  return false;
}

export function isWebGPUViewportCullingAsyncEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  const culling = config?.webgpu?.culling;
  if (culling?.async === false) return false;
  return true;
}

export function isWebGPUStatesConditionalUploadEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  return config?.webgpu?.statesConditionalUpload === true;
}

export function isWebGPUForceStatesUploadEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  return config?.webgpu?.forceStatesUpload === true;
}

export function isWebGPUBatchedSubmitEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  return config?.webgpu?.batchedSubmit === true;
}

export function resolveWebGPUReadbackMode(
  config: NormalizedMotionAppConfig | undefined,
): WebGPUReadbackMode {
  const mode = config?.webgpu?.readbackMode;
  if (mode === 'visible') return 'visible';
  return 'full';
}

export function resolveWebGPUOutputBufferReuseEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  return config?.webgpu?.outputBufferReuse === true;
}

export function resolveKeyframeSearchOptimizedFlag(
  config: NormalizedMotionAppConfig | undefined,
  envOverride?: string | null,
): boolean {
  if (typeof config?.keyframe?.searchOptimized === 'boolean') {
    return config.keyframe.searchOptimized;
  }
  let envValue: string | undefined;
  if (typeof envOverride === 'string') {
    envValue = envOverride;
  } else {
    envValue = undefined;
  }
  if (typeof envValue === 'string') {
    const lower = envValue.toLowerCase();
    if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off') {
      return false;
    }
    return true;
  }
  return true;
}

export function isKeyframeEntryExpandOnGPUEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  if (typeof config?.keyframe?.entryExpandOnGPU === 'boolean') {
    return config.keyframe.entryExpandOnGPU;
  }
  return true;
}

export function isKeyframeSearchIndexedEnabled(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  return config?.keyframe?.searchIndexed === true;
}

export function resolveKeyframeSearchIndexedMinKeyframes(
  config: NormalizedMotionAppConfig | undefined,
): number {
  const v = config?.keyframe?.searchIndexedMinKeyframes;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return 64;
}

export function __resolveKeyframeSearchOptimizedFlagForTests(
  config: NormalizedMotionAppConfig | undefined,
  envOverride?: string | null,
): boolean {
  return resolveKeyframeSearchOptimizedFlag(config, envOverride);
}

export function __resolveWebGPUReadbackModeForTests(
  config: NormalizedMotionAppConfig | undefined,
): WebGPUReadbackMode {
  return resolveWebGPUReadbackMode(config);
}

export function __resolveWebGPUOutputBufferReuseEnabledForTests(
  config: NormalizedMotionAppConfig | undefined,
): boolean {
  return resolveWebGPUOutputBufferReuseEnabled(config);
}
