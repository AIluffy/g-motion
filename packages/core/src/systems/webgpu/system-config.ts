import type { MotionAppConfig } from '../../plugin';

export type WebGPUReadbackMode = 'full' | 'visible';

export function isWebGPUIODebugEnabled(config: MotionAppConfig | undefined): boolean {
  if (config?.debugWebGPUIO === true) return true;
  if (config?.debug?.webgpuIO === true) return true;
  return false;
}

export function isWebGPUViewportCullingEnabled(config: MotionAppConfig | undefined): boolean {
  const culling = config?.webgpuCulling;
  if (culling) {
    if (culling.enabled === true && culling.viewport !== false) return true;
    if (culling.viewport === true) return true;
  }
  return false;
}

export function isWebGPUViewportCullingAsyncEnabled(config: MotionAppConfig | undefined): boolean {
  const culling = config?.webgpuCulling;
  if (culling?.async === false) return false;
  return true;
}

export function isWebGPUStatesConditionalUploadEnabled(
  config: MotionAppConfig | undefined,
): boolean {
  return config?.webgpuStatesConditionalUpload === true;
}

export function isWebGPUForceStatesUploadEnabled(config: MotionAppConfig | undefined): boolean {
  return config?.webgpuForceStatesUpload === true;
}

export function isWebGPUBatchedSubmitEnabled(config: MotionAppConfig | undefined): boolean {
  return config?.webgpuBatchedSubmit === true;
}

export function resolveWebGPUReadbackMode(config: MotionAppConfig | undefined): WebGPUReadbackMode {
  const mode = config?.webgpuReadbackMode;
  if (mode === 'visible') return 'visible';
  return 'full';
}

export function resolveWebGPUOutputBufferReuseEnabled(
  config: MotionAppConfig | undefined,
): boolean {
  return config?.webgpuOutputBufferReuse === true;
}

export function resolveKeyframeSearchOptimizedFlag(
  config: MotionAppConfig | undefined,
  envOverride?: string | null,
): boolean {
  if (typeof config?.keyframeSearchOptimized === 'boolean') {
    return config.keyframeSearchOptimized;
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

export function isKeyframeEntryExpandOnGPUEnabled(config: MotionAppConfig | undefined): boolean {
  if (typeof config?.keyframeEntryExpandOnGPU === 'boolean') {
    return config.keyframeEntryExpandOnGPU;
  }
  return true;
}

export function isKeyframeSearchIndexedEnabled(config: MotionAppConfig | undefined): boolean {
  return config?.keyframeSearchIndexed === true;
}

export function resolveKeyframeSearchIndexedMinKeyframes(
  config: MotionAppConfig | undefined,
): number {
  const v = config?.keyframeSearchIndexedMinKeyframes;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return 64;
}

export function __resolveKeyframeSearchOptimizedFlagForTests(
  config: MotionAppConfig | undefined,
  envOverride?: string | null,
): boolean {
  return resolveKeyframeSearchOptimizedFlag(config, envOverride);
}

export function __resolveWebGPUReadbackModeForTests(
  config: MotionAppConfig | undefined,
): WebGPUReadbackMode {
  return resolveWebGPUReadbackMode(config);
}

export function __resolveWebGPUOutputBufferReuseEnabledForTests(
  config: MotionAppConfig | undefined,
): boolean {
  return resolveWebGPUOutputBufferReuseEnabled(config);
}
