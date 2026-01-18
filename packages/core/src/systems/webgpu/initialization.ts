/**
 * WebGPU Compute Initialization
 *
 * Handles asynchronous GPU device creation, validation, and pipeline setup.
 */

import { WebGPUBufferManager } from '../../webgpu/buffer';
import { buildInterpolationShader } from '../../webgpu/shader';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../systems/easing-registry';
import { getGPUMetricsProvider } from '../../webgpu/metrics-provider';
import { getAppContext, getErrorHandler } from '../../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../../errors';
import { precompileWorkgroupPipelines } from './pipeline';

const bindGroupLayoutEntries = [
  {
    binding: 0,
    visibility: 4, // GPUShaderStage.COMPUTE = 4
    buffer: { type: 'storage' as const }, // states
  },
  {
    binding: 1,
    visibility: 4, // GPUShaderStage.COMPUTE = 4
    buffer: { type: 'read-only-storage' as const }, // keyframes
  },
  {
    binding: 2,
    visibility: 4, // GPUShaderStage.COMPUTE = 4
    buffer: { type: 'storage' as const }, // outputs
  },
];

export async function initWebGPUCompute(
  bufferManager: WebGPUBufferManager,
): Promise<{ success: boolean; deviceAvailable: boolean; shaderVersion: number }> {
  const initOk = await bufferManager.init();
  const device = bufferManager.getDevice();
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
    getAppContext().setWebGPUInitialized(true);
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
