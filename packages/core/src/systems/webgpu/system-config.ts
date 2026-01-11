import type { MotionAppConfig } from '../../plugin';

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

export function __resolveKeyframeSearchOptimizedFlagForTests(
  config: MotionAppConfig | undefined,
  envOverride?: string | null,
): boolean {
  return resolveKeyframeSearchOptimizedFlag(config, envOverride);
}
