import { ErrorCode, ErrorHandler, ErrorSeverity, MotionError } from '@g-motion/shared';
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
  errorHandler: ErrorHandler;
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
  const { metricsProvider, errorHandler, getCustomGpuEasings, getCustomEasingVersion } = deps;
  const initOk = await engine.initialize();
  const device = engine.getGPUDevice();
  if (!initOk || !device) {
    const error = new MotionError(
      'WebGPU not available.',
      ErrorCode.GPU_DEVICE_UNAVAILABLE,
      ErrorSeverity.FATAL,
      {
        initOk,
        hasDevice: !!device,
        stage: 'device',
        source: 'initWebGPUCompute',
      },
    );
    errorHandler.handle(error);
    throw error;
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
    const error = new MotionError(
      'WebGPU compute pipeline initialization failed.',
      ErrorCode.GPU_PIPELINE_FAILED,
      ErrorSeverity.FATAL,
      {
        shaderVersion,
        stage: 'pipeline',
        source: 'initWebGPUCompute',
      },
    );
    errorHandler.handle(error);
    throw error;
  }

  return { success: true, deviceAvailable: true, shaderVersion };
}

export async function ensureWebGPUInitialized(params: {
  engine: WebGPUEngine;
  deps: WebGPUInitializationDeps;
}): Promise<void> {
  const { engine, deps } = params;
  const { metricsProvider, errorHandler, getCustomEasingVersion } = deps;

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
    const error = new MotionError(
      'WebGPU is not supported in this environment.',
      ErrorCode.GPU_ADAPTER_UNAVAILABLE,
      ErrorSeverity.FATAL,
    );
    errorHandler.handle(error);
    throw error;
  }

  try {
    const initResult = await initWebGPUCompute(engine, deps);
    engine.setDeviceAvailable(true);
    engine.setShaderVersion(initResult.shaderVersion);
  } catch {
    const error = new MotionError(
      'Failed to initialize WebGPU. GPU may be unavailable or blocked.',
      ErrorCode.GPU_INIT_FAILED,
      ErrorSeverity.FATAL,
    );
    errorHandler.handle(error);
    throw error;
  }

  const device = engine.getGPUDevice();
  if (!device) {
    const error = new MotionError(
      'WebGPU device is not available.',
      ErrorCode.GPU_DEVICE_UNAVAILABLE,
      ErrorSeverity.FATAL,
    );
    errorHandler.handle(error);
    throw error;
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
