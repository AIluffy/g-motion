export function isWebGPUIODebugEnabled(config: any): boolean {
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
  if (g && g.__MOTION_DEBUG_WEBGPU_IO__) return true;
  if (config && typeof config === 'object') {
    if (config.debugWebGPUIO === true) return true;
    const debugCfg = (config as any).debug;
    if (debugCfg && typeof debugCfg === 'object' && debugCfg.webgpuIO === true) return true;
  }
  return false;
}

export function isWebGPUViewportCullingEnabled(config: any): boolean {
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
  if (g && g.__MOTION_WEBGPU_VIEWPORT_CULLING__) return true;
  if (config && typeof config === 'object') {
    const culling = (config as any).webgpuCulling;
    if (culling && typeof culling === 'object') {
      if (culling.enabled === true && culling.viewport !== false) return true;
      if (culling.viewport === true) return true;
    }
  }
  return false;
}

export function isWebGPUViewportCullingAsyncEnabled(config: any): boolean {
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
  if (g && g.__MOTION_WEBGPU_CULLING_SYNC__) return false;
  if (config && typeof config === 'object') {
    const culling = (config as any).webgpuCulling;
    if (culling && typeof culling === 'object') {
      if (culling.async === false) return false;
    }
  }
  return true;
}

export function resolveKeyframeSearchOptimizedFlag(
  config: any,
  envOverride?: string | null,
): boolean {
  if (config && typeof config.keyframeSearchOptimized === 'boolean') {
    return config.keyframeSearchOptimized;
  }
  let envValue: string | undefined;
  if (typeof envOverride === 'string') {
    envValue = envOverride;
  } else {
    const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined;
    const env =
      g && g.process && g.process.env
        ? (g.process.env as Record<string, string | undefined>)
        : undefined;
    if (env) {
      envValue = env.MOTION_USE_OPTIMIZED_KEYFRAME_SHADER;
    }
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
  config: any,
  envOverride?: string | null,
): boolean {
  return resolveKeyframeSearchOptimizedFlag(config, envOverride);
}
