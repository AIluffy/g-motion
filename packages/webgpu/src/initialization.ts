import { panic } from '@g-motion/shared';
import { AsyncReadbackManager } from './async-readback';
import type { WebGPUEngine } from './engine';
import type { GPUMetricsProvider } from './metrics-provider';
import { getPersistentGPUBufferManager } from './persistent-buffer-manager';
import { PHYSICS_COMBINED_SHADER } from './physics-shader';
import { clearPipelineCache, precompileWorkgroupPipelines } from './pipeline';
import { buildInterpolationShader } from './shader';
import { StagingBufferPool } from './staging-pool';
import { getTimingHelper } from './timing-helper';

type CustomGpuEasing = { name: string; wgslFn: string; id: number };

export type WebGPUInitializationDeps = {
  metricsProvider: GPUMetricsProvider;
  getCustomGpuEasings: () => ReadonlyArray<CustomGpuEasing>;
  getCustomEasingVersion: () => number;
};

const INTERP_BIND_GROUP_LAYOUT_ENTRIES = [
  {
    binding: 0,
    visibility: 4,
    buffer: { type: 'storage' as const },
  },
  {
    binding: 1,
    visibility: 4,
    buffer: { type: 'read-only-storage' as const },
  },
  {
    binding: 2,
    visibility: 4,
    buffer: { type: 'storage' as const },
  },
];

const PHYSICS_BIND_GROUP_LAYOUT_ENTRIES = [
  { binding: 0, visibility: 4, buffer: { type: 'storage' as const } },
  { binding: 1, visibility: 4, buffer: { type: 'uniform' as const } },
  { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
  { binding: 3, visibility: 4, buffer: { type: 'storage' as const } },
];

export async function initWebGPUCompute(
  engine: WebGPUEngine,
  deps: WebGPUInitializationDeps,
): Promise<{ success: boolean; deviceAvailable: boolean; shaderVersion: number }> {
  const { metricsProvider, getCustomGpuEasings, getCustomEasingVersion } = deps;
  const initOk = await engine.initialize();
  const device = engine.getGPUDevice();
  if (!initOk || !device) {
    panic('WebGPU not available.', {
      initOk,
      hasDevice: !!device,
      stage: 'device',
      source: 'initWebGPUCompute',
    });
  }

  const success = await precompileWorkgroupPipelines(
    device,
    buildInterpolationShader(getCustomGpuEasings()),
    INTERP_BIND_GROUP_LAYOUT_ENTRIES,
    'main',
    'interp',
  );

  const shaderVersion = getCustomEasingVersion();

  if (success) {
    metricsProvider.updateStatus({
      gpuInitialized: true,
      webgpuAvailable: true,
      enabled: true,
    });
  } else {
    panic('WebGPU compute pipeline initialization failed.', {
      shaderVersion,
      stage: 'pipeline',
      source: 'initWebGPUCompute',
    });
  }

  return { success: true, deviceAvailable: true, shaderVersion };
}

export async function ensureWebGPUInitialized(params: {
  engine: WebGPUEngine;
  deps: WebGPUInitializationDeps;
}): Promise<void> {
  const { engine, deps } = params;
  const { metricsProvider, getCustomEasingVersion } = deps;

  if (engine.isInitialized) return;

  const maybeGpu = (globalThis as any).navigator?.gpu as { __isFake?: boolean } | undefined;
  if (maybeGpu?.__isFake === true) {
    engine.setMockWebGPU(true);
    engine.setDeviceAvailable(true);
    engine.setShaderVersion(getCustomEasingVersion());
    metricsProvider.updateStatus({
      webgpuAvailable: true,
      gpuInitialized: true,
      enabled: true,
    });
    return;
  }

  if (!maybeGpu) {
    panic('WebGPU is not supported in this environment.');
  }

  try {
    const initResult = await initWebGPUCompute(engine, deps);
    engine.setDeviceAvailable(true);
    engine.setShaderVersion(initResult.shaderVersion);
  } catch {
    panic('Failed to initialize WebGPU. GPU may be unavailable or blocked.');
  }

  const device = engine.getGPUDevice();
  if (!device) {
    panic('WebGPU device is not available.');
  }

  engine.setTimingHelper(getTimingHelper(device));
  engine.setStagingPool(new StagingBufferPool(device));
  engine.setReadbackManager(new AsyncReadbackManager());
  getPersistentGPUBufferManager(device);
  engine.setPersistentBufferManager(getPersistentGPUBufferManager(device));

  metricsProvider.updateStatus({
    webgpuAvailable: true,
    gpuInitialized: true,
    enabled: true,
  });
}

export async function ensureWebGPUPipelines(params: {
  engine: WebGPUEngine;
  device: GPUDevice;
  deps: WebGPUInitializationDeps;
}): Promise<void> {
  const { engine, device, deps } = params;
  const { getCustomGpuEasings, getCustomEasingVersion } = deps;

  const currentVersion = getCustomEasingVersion();
  if (currentVersion !== engine.shaderVersion) {
    clearPipelineCache();
    const success = await precompileWorkgroupPipelines(
      device,
      buildInterpolationShader(getCustomGpuEasings()),
      INTERP_BIND_GROUP_LAYOUT_ENTRIES,
      'main',
      'interp',
    );

    if (success) {
      engine.setShaderVersion(currentVersion);
    }
  }

  if (!engine.physicsPipelinesReady) {
    const ok = await precompileWorkgroupPipelines(
      device,
      PHYSICS_COMBINED_SHADER,
      PHYSICS_BIND_GROUP_LAYOUT_ENTRIES,
      'updatePhysics',
      'physics',
    );

    if (ok) engine.setPhysicsPipelinesReady(true);
  }
}
