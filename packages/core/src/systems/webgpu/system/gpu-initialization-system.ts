import type { MotionAppConfig } from '../../../plugin';
import type { GPUMetricsProvider } from '../../../webgpu/metrics-provider';
import { getWebGPUBufferManager } from '../../../webgpu/buffer';
import { getTimingHelper } from '../../../webgpu/timing-helper';
import { StagingBufferPool } from '../../../webgpu/staging-pool';
import { AsyncReadbackManager } from '../../../webgpu/async-readback';
import { getPersistentGPUBufferManager } from '../../../webgpu/persistent-buffer-manager';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../../webgpu/custom-easing';
import { buildInterpolationShader } from '../../../webgpu/shader';
import { PHYSICS_COMBINED_SHADER } from '../../../webgpu/physics-shader';
import { initWebGPUCompute } from '../initialization';
import { precompileWorkgroupPipelines } from '../pipeline';
import { getOutputFormatBufferPoolStats } from '../output-format';
import type { WebGPUComputeRuntime } from './runtime';

export async function ensureWebGPUInitialized(params: {
  runtime: WebGPUComputeRuntime;
  metricsProvider: GPUMetricsProvider;
  config: MotionAppConfig;
}): Promise<void> {
  const { runtime, metricsProvider } = params;

  if (runtime.isInitialized) return;

  const maybeGpu = (globalThis as any).navigator?.gpu as { __isFake?: boolean } | undefined;
  if (maybeGpu?.__isFake === true) {
    runtime.isInitialized = true;
    runtime.deviceAvailable = true;
    runtime.mockWebGPU = true;
    runtime.shaderVersion = getCustomEasingVersion();
    metricsProvider.updateStatus({
      webgpuAvailable: true,
      gpuInitialized: true,
      enabled: true,
    });
    return;
  }

  if (!maybeGpu) {
    runtime.isInitialized = true;
    runtime.deviceAvailable = false;
    metricsProvider.updateStatus({
      webgpuAvailable: false,
      gpuInitialized: false,
      enabled: false,
    });
    return;
  }

  runtime.bufferManager = getWebGPUBufferManager();
  try {
    const initResult = await initWebGPUCompute(runtime.bufferManager);
    runtime.isInitialized = true;
    runtime.deviceAvailable = true;
    runtime.shaderVersion = initResult.shaderVersion;
  } catch {
    runtime.isInitialized = true;
    runtime.deviceAvailable = false;
    metricsProvider.updateStatus({
      webgpuAvailable: false,
      gpuInitialized: false,
      enabled: false,
    });
    return;
  }

  const device = runtime.bufferManager.getDevice();
  if (!device) {
    runtime.deviceAvailable = false;
    metricsProvider.updateStatus({
      webgpuAvailable: true,
      gpuInitialized: false,
      enabled: false,
    });
    return;
  }

  runtime.timingHelper = getTimingHelper(device);
  runtime.stagingPool = new StagingBufferPool(device);
  runtime.readbackManager = new AsyncReadbackManager();
  getPersistentGPUBufferManager(device);

  metricsProvider.updateStatus({
    webgpuAvailable: true,
    gpuInitialized: true,
    enabled: true,
  });
}

export async function ensureWebGPUPipelines(params: {
  runtime: WebGPUComputeRuntime;
  device: GPUDevice;
}): Promise<void> {
  const { runtime, device } = params;

  const currentVersion = getCustomEasingVersion();
  if (currentVersion !== runtime.shaderVersion) {
    const bindGroupLayoutEntries = [
      { binding: 0, visibility: 4, buffer: { type: 'storage' as const } },
      { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' as const } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' as const } },
    ];

    const success = await precompileWorkgroupPipelines(
      device,
      buildInterpolationShader(getCustomGpuEasings()),
      bindGroupLayoutEntries,
      'main',
      'interp',
    );

    if (success) {
      runtime.shaderVersion = currentVersion;
    }
  }

  if (!runtime.physicsPipelinesReady) {
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

    if (ok) runtime.physicsPipelinesReady = true;
  }
}

export function maybeSampleOutputFormatPoolStats(params: {
  runtime: WebGPUComputeRuntime;
  metricsProvider: GPUMetricsProvider;
  config: MotionAppConfig;
  device: GPUDevice;
}): void {
  const { runtime, metricsProvider, config, device } = params;
  runtime.outputFormatStatsCounter++;
  const samplingRate =
    typeof config.metricsSamplingRate === 'number' ? config.metricsSamplingRate : 1;
  const shouldSample =
    samplingRate <= 1 ||
    runtime.outputFormatStatsCounter % Math.max(1, Math.floor(samplingRate)) === 0;
  if (!shouldSample) return;
  metricsProvider.updateStatus({
    outputFormatPoolStats: getOutputFormatBufferPoolStats(device),
  });
}
