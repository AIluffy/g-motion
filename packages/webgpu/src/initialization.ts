import { getCustomEasingVersion, getCustomGpuEasings, panic } from '@g-motion/shared';
import { AsyncReadbackManager } from './async-readback';
import type { WebGPUEngine } from './engine';
import { getGPUMetricsProvider } from './metrics-provider';
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

export type InitConfig = {
  metricsProvider?: GPUMetricsProvider;
  getCustomGpuEasings?: () => ReadonlyArray<CustomGpuEasing>;
  getCustomEasingVersion?: () => number;
  allowMock?: boolean;
};

export type WebGPUInitResult = {
  success: boolean;
  deviceAvailable: boolean;
  shaderVersion: number;
  mockWebGPU: boolean;
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

const resolveInitDeps = (config?: InitConfig): WebGPUInitializationDeps => ({
  metricsProvider: config?.metricsProvider ?? getGPUMetricsProvider(),
  getCustomGpuEasings: config?.getCustomGpuEasings ?? getCustomGpuEasings,
  getCustomEasingVersion: config?.getCustomEasingVersion ?? getCustomEasingVersion,
});

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

export async function initializeWebGPU(
  engine: WebGPUEngine,
  config?: InitConfig,
): Promise<WebGPUInitResult> {
  const deps = resolveInitDeps(config);
  const { metricsProvider, getCustomEasingVersion } = deps;

  if (engine.isInitialized) {
    return {
      success: true,
      deviceAvailable: engine.deviceAvailable,
      shaderVersion: engine.shaderVersion,
      mockWebGPU: engine.mockWebGPU,
    };
  }

  const allowMock = config?.allowMock !== false;
  const maybeGpu = (globalThis as any).navigator?.gpu as { __isFake?: boolean } | undefined;
  if (allowMock && maybeGpu?.__isFake === true) {
    const shaderVersion = getCustomEasingVersion();
    engine.setMockWebGPU(true);
    engine.setDeviceAvailable(true);
    engine.setShaderVersion(shaderVersion);
    metricsProvider.updateStatus({
      webgpuAvailable: true,
      gpuInitialized: true,
      enabled: true,
    });
    return { success: true, deviceAvailable: true, shaderVersion, mockWebGPU: true };
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

  return {
    success: true,
    deviceAvailable: true,
    shaderVersion: engine.shaderVersion,
    mockWebGPU: false,
  };
}

export async function ensureWebGPUInitialized(params: {
  engine: WebGPUEngine;
  deps: WebGPUInitializationDeps;
}): Promise<void> {
  const { engine, deps } = params;
  await initializeWebGPU(engine, deps);
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
