/**
 * WebGPU Pipeline Management
 *
 * Main entry point for pipeline caching and precompilation.
 */

import { getBucket, clearPipelineCache, cachePipeline } from './cache';
import {
  selectWorkgroupSize,
  buildCacheKey,
  makeWorkgroupVariant,
  WorkgroupSize,
} from './workgroup';

import { WebGPUConstants } from '../../../constants/webgpu';

const WORKGROUP_SIZES = [
  WebGPUConstants.WORKGROUP.SIZE_SMALL,
  WebGPUConstants.WORKGROUP.SIZE_MEDIUM,
  WebGPUConstants.WORKGROUP.SIZE_DEFAULT,
  WebGPUConstants.WORKGROUP.SIZE_XLARGE,
] as const;

/**
 * Get or retrieve pipeline for a given workgroup size
 * Returns best-match pipeline based on workgroupHint.
 */
export async function getPipelineForWorkgroup(
  _device: GPUDevice,
  workgroupHint: number,
  cacheId: string = 'default',
): Promise<GPUComputePipeline | null> {
  const selected = selectWorkgroupSize(workgroupHint);
  const pipelineCache = getBucket(cacheId).pipelineCache;
  const { WORKGROUP } = WebGPUConstants;
  return (
    pipelineCache.get(selected) ??
    pipelineCache.get(WORKGROUP.SIZE_DEFAULT) ??
    pipelineCache.get(WORKGROUP.SIZE_MEDIUM) ??
    pipelineCache.get(WORKGROUP.SIZE_SMALL) ??
    pipelineCache.get(WORKGROUP.SIZE_XLARGE) ??
    null
  );
}

/**
 * Precompile all workgroup size variants for a shader
 */
export async function precompileWorkgroupPipelines(
  device: GPUDevice,
  shaderCode: string,
  bindGroupLayoutEntries: any[],
  entryPoint: string = 'main',
  cacheId: string = 'default',
): Promise<boolean> {
  const bucket = getBucket(cacheId);
  const key = buildCacheKey(shaderCode, bindGroupLayoutEntries, entryPoint);
  const { WORKGROUP } = WebGPUConstants;
  const hasAll =
    bucket.pipelineCache.has(WORKGROUP.SIZE_SMALL) &&
    bucket.pipelineCache.has(WORKGROUP.SIZE_MEDIUM) &&
    bucket.pipelineCache.has(WORKGROUP.SIZE_DEFAULT) &&
    bucket.pipelineCache.has(WORKGROUP.SIZE_XLARGE);
  if (bucket.pipelineCacheDevice === device && bucket.pipelineCacheKey === key && hasAll) {
    return true;
  }

  bucket.pipelineCache.clear();
  bucket.pipelineCacheDevice = device;
  bucket.pipelineCacheKey = key;

  try {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'motion-workgroup-variant-bgl',
      entries: bindGroupLayoutEntries,
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'motion-workgroup-variant-pl',
      bindGroupLayouts: [bindGroupLayout],
    });

    for (const wg of WORKGROUP_SIZES) {
      const variantCode = makeWorkgroupVariant(shaderCode, wg);
      const shaderModule = device.createShaderModule({
        code: variantCode,
        label: `motion-interp-wgsl-wg${wg}`,
      });

      const pipeline = device.createComputePipeline({
        label: `motion-interp-pipeline-wg${wg}`,
        layout: pipelineLayout,
        compute: { module: shaderModule, entryPoint },
      });

      bucket.pipelineCache.set(wg, pipeline);
    }

    return true;
  } catch {
    bucket.pipelineCache.clear();
    bucket.pipelineCacheKey = null;
    bucket.pipelineCacheDevice = null;
    return false;
  }
}

export { clearPipelineCache, cachePipeline, selectWorkgroupSize, WorkgroupSize };
