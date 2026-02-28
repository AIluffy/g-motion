/**
 * WebGPU Compute Initialization
 *
 * Handles asynchronous GPU device creation, validation, and pipeline setup.
 */

import { getCustomEasingVersion, getCustomGpuEasings, panic } from '@g-motion/shared';
import type { WebGPUEngine } from '@g-motion/webgpu';
import {
  buildInterpolationShader,
  getGPUMetricsProvider,
  precompileWorkgroupPipelines,
} from '@g-motion/webgpu';

const bindGroupLayoutEntries = [
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

export async function initWebGPUCompute(
  engine: WebGPUEngine,
): Promise<{ success: boolean; deviceAvailable: boolean; shaderVersion: number }> {
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
    bindGroupLayoutEntries,
    'main',
    'interp',
  );

  const shaderVersion = getCustomEasingVersion();

  if (success) {
    getGPUMetricsProvider().updateStatus({
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
