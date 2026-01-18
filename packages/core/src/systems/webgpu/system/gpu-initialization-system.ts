import { getOutputFormatBufferPoolStats } from '../output-format/pass';
import type { MotionAppConfig } from '../../../plugin';
import type { GPUMetricsProvider } from '../../../webgpu/metrics-provider';
import { MotionError, ErrorCode, ErrorSeverity } from '../../../errors';
import { getTimingHelper } from '../../../webgpu/timing-helper';
import { StagingBufferPool } from '../../../webgpu/staging-pool';
import { AsyncReadbackManager } from '../../../webgpu/async-readback';
import { getPersistentGPUBufferManager } from '../../../webgpu/persistent-buffer-manager';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../../systems/easing-registry';
import { buildInterpolationShader } from '../../../webgpu/shader';
import { PHYSICS_COMBINED_SHADER } from '../../../webgpu/physics-shader';
import { initWebGPUCompute } from '../initialization';
import { precompileWorkgroupPipelines, clearPipelineCache } from '../pipeline';
import type { WebGPUEngine } from '../../../webgpu/engine';

export async function ensureWebGPUInitialized(params: {
  engine: WebGPUEngine;
  metricsProvider: GPUMetricsProvider;
  config: MotionAppConfig;
}): Promise<void> {
  const { engine, metricsProvider } = params;

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
    throw new MotionError(
      'WebGPU is not supported in this environment.',
      ErrorCode.GPU_ADAPTER_UNAVAILABLE,
      ErrorSeverity.FATAL,
    );
  }

  try {
    const initResult = await initWebGPUCompute(engine);
    engine.setDeviceAvailable(true);
    engine.setShaderVersion(initResult.shaderVersion);
  } catch {
    throw new MotionError(
      'Failed to initialize WebGPU. GPU may be unavailable or blocked.',
      ErrorCode.GPU_INIT_FAILED,
      ErrorSeverity.FATAL,
    );
  }

  const device = engine.getGPUDevice();
  if (!device) {
    throw new MotionError(
      'WebGPU device is not available.',
      ErrorCode.GPU_DEVICE_UNAVAILABLE,
      ErrorSeverity.FATAL,
    );
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
}): Promise<void> {
  const { engine, device } = params;

  const currentVersion = getCustomEasingVersion();
  if (currentVersion !== engine.shaderVersion) {
    const bindGroupLayoutEntries = [
      { binding: 0, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
    ];

    clearPipelineCache();
    const success = await precompileWorkgroupPipelines(
      device,
      buildInterpolationShader(getCustomGpuEasings()),
      bindGroupLayoutEntries,
      'main',
      'interp',
    );

    if (success) {
      engine.setShaderVersion(currentVersion);
    }
  }

  if (!engine.physicsPipelinesReady) {
    const bindGroupLayoutEntries = [
      { binding: 0, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'uniform' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 3, visibility: 4, buffer: { type: 'storage' as const } },
    ];

    const ok = await precompileWorkgroupPipelines(
      device,
      PHYSICS_COMBINED_SHADER,
      bindGroupLayoutEntries,
      'updatePhysics',
      'physics',
    );

    if (ok) engine.setPhysicsPipelinesReady(true);
  }
}

export function maybeSampleOutputFormatPoolStats(params: {
  engine: WebGPUEngine;
  metricsProvider: GPUMetricsProvider;
  config: MotionAppConfig;
  device: GPUDevice;
}): void {
  const { engine, metricsProvider, config, device } = params;
  engine.incrementOutputFormatStatsCounter();
  const samplingRate =
    typeof config.metricsSamplingRate === 'number' ? config.metricsSamplingRate : 1;
  const shouldSample =
    samplingRate <= 1 ||
    engine.outputFormatStatsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
  if (!shouldSample) return;

  metricsProvider.updateStatus({
    outputFormatPoolStats: getOutputFormatBufferPoolStats(device),
  });
}
