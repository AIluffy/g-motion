import type { NormalizedMotionAppConfig } from '../../../runtime/plugin';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../../runtime/easing-registry';
import { getGPUModuleSync } from '../../../gpu-bridge';
import type { GPUMetricsProvider, WebGPUInitResult } from '../../../gpu-bridge/types';
import type { WebGPUEngine } from '../../../gpu-bridge/types';

const buildInitDeps = (metricsProvider: GPUMetricsProvider) => ({
  metricsProvider,
  getCustomGpuEasings,
  getCustomEasingVersion,
});

export async function ensureWebGPUInitialized(params: {
  engine: WebGPUEngine;
  metricsProvider: GPUMetricsProvider;
}): Promise<WebGPUInitResult> {
  const { engine, metricsProvider } = params;
  const deps = buildInitDeps(metricsProvider);
  const gpu = getGPUModuleSync();
  if (!gpu) {
    throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  }
  return gpu.ensureWebGPUInitialized({ engine, deps });
}

export async function ensureWebGPUPipelines(params: {
  engine: WebGPUEngine;
  device: GPUDevice;
  metricsProvider: GPUMetricsProvider;
}): Promise<void> {
  const { engine, device, metricsProvider } = params;
  const deps = buildInitDeps(metricsProvider);
  const gpu = getGPUModuleSync();
  if (!gpu) {
    throw new Error('WebGPU module not loaded. Call preloadWebGPUModule() during initialization.');
  }
  await gpu.ensureWebGPUPipelines({ engine, device, deps });
}

export function maybeSampleOutputFormatPoolStats(params: {
  engine: WebGPUEngine;
  metricsProvider: GPUMetricsProvider;
  config: NormalizedMotionAppConfig;
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
    outputFormatPoolStats:
      getGPUModuleSync()?.getOutputFormatBufferPoolStats?.(device) ?? undefined,
  });
}
