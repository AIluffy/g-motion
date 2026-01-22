/**
 * WebGPU Compute Initialization
 *
 * Handles asynchronous GPU device creation, validation, and pipeline setup.
 */

import {
  ErrorCode,
  ErrorSeverity,
  getCustomEasingVersion,
  getCustomGpuEasings,
  MotionError,
} from '@g-motion/shared';
import type { WebGPUEngine } from '@g-motion/webgpu';
import {
  buildInterpolationShader,
  getGPUMetricsProvider,
  precompileWorkgroupPipelines,
} from '@g-motion/webgpu';
import { getErrorHandler } from '../../context';

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
    getErrorHandler().handle(error);
    throw error;
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
    getErrorHandler().handle(error);
    throw error;
  }

  return { success: true, deviceAvailable: true, shaderVersion };
}
