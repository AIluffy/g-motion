/**
 * WebGPU Compute Initialization
 *
 * Handles asynchronous GPU device creation, validation, and pipeline setup.
 */

import { WebGPUBufferManager } from '../../webgpu/buffer';
import { buildInterpolationShader } from '../../webgpu/shader';
import { getCustomEasingVersion, getCustomGpuEasings } from '../../webgpu/custom-easing';
import { getGPUMetricsProvider } from '../../webgpu/metrics-provider';
import { getAppContext, getErrorHandler } from '../../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../../errors';

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
      'WebGPU not available; GPU batch processing disabled. CPU path will be used.',
      ErrorCode.GPU_DEVICE_UNAVAILABLE,
      ErrorSeverity.WARNING,
      {
        initOk,
        hasDevice: !!device,
        stage: 'device',
        source: 'initWebGPUCompute',
      },
    );
    getErrorHandler().handle(error);
    return { success: false, deviceAvailable: false, shaderVersion: -1 };
  }

  // Initialize compute pipeline for default workgroup size (64)
  const success = await bufferManager.initComputePipeline({
    shaderCode: buildInterpolationShader(getCustomGpuEasings()),
    bindGroupLayoutEntries,
  });

  const shaderVersion = getCustomEasingVersion();

  if (success) {
    getAppContext().setWebGPUInitialized(true);
    getGPUMetricsProvider().updateStatus({
      gpuInitialized: true,
      webgpuAvailable: true,
    });
  } else {
    const error = new MotionError(
      'WebGPU compute pipeline initialization failed; GPU batch processing disabled.',
      ErrorCode.GPU_PIPELINE_FAILED,
      ErrorSeverity.WARNING,
      {
        shaderVersion,
        stage: 'pipeline',
        source: 'initWebGPUCompute',
      },
    );
    getErrorHandler().handle(error);
  }

  return { success, deviceAvailable: success, shaderVersion };
}
