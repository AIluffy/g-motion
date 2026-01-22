/**
 * WebGPU Pipeline Management
 *
 * Caches and retrieves compute pipelines for different workgroup sizes.
 */

import { WebGPUConstants } from '@g-motion/shared';

const WORKGROUP_SIZES = [
  WebGPUConstants.WORKGROUP.SIZE_SMALL,
  WebGPUConstants.WORKGROUP.SIZE_MEDIUM,
  WebGPUConstants.WORKGROUP.SIZE_DEFAULT,
  WebGPUConstants.WORKGROUP.SIZE_XLARGE,
] as const;
type WorkgroupSize = (typeof WORKGROUP_SIZES)[number];

type PipelineBucket = {
  pipelineCache: Map<number, GPUComputePipeline>;
  pipelineCacheKey: string | null;
  pipelineCacheDevice: GPUDevice | null;
};

const pipelineBuckets = new Map<string, PipelineBucket>();

function getBucket(cacheId: string): PipelineBucket {
  const id = cacheId || 'default';
  let b = pipelineBuckets.get(id);
  if (!b) {
    b = {
      pipelineCache: new Map(),
      pipelineCacheKey: null,
      pipelineCacheDevice: null,
    };
    pipelineBuckets.set(id, b);
  }
  return b;
}

export function cachePipeline(workgroupSize: number, pipeline: GPUComputePipeline): void {
  getBucket('default').pipelineCache.set(workgroupSize, pipeline);
}

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

export function clearPipelineCache(): void {
  for (const b of pipelineBuckets.values()) {
    b.pipelineCache.clear();
    b.pipelineCacheKey = null;
    b.pipelineCacheDevice = null;
  }
}

export function selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
  const { WORKGROUP } = WebGPUConstants;

  if (!Number.isFinite(workgroupHint) || workgroupHint <= 0) return WORKGROUP.SIZE_DEFAULT;
  if (
    workgroupHint === WORKGROUP.SIZE_SMALL ||
    workgroupHint === WORKGROUP.SIZE_MEDIUM ||
    workgroupHint === WORKGROUP.SIZE_DEFAULT ||
    workgroupHint === WORKGROUP.SIZE_XLARGE
  ) {
    return workgroupHint as WorkgroupSize;
  }

  const entityCount = Math.floor(workgroupHint);
  if (entityCount >= WORKGROUP.ENTITY_COUNT_XLARGE_THRESHOLD) return WORKGROUP.SIZE_XLARGE;
  if (entityCount < WORKGROUP.ENTITY_COUNT_SMALL_THRESHOLD) return WORKGROUP.SIZE_SMALL;
  if (entityCount < WORKGROUP.ENTITY_COUNT_MEDIUM_THRESHOLD) return WORKGROUP.SIZE_MEDIUM;
  return WORKGROUP.SIZE_DEFAULT;
}

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

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function buildCacheKey(
  shaderCode: string,
  bindGroupLayoutEntries: any[],
  entryPoint: string,
): string {
  const bindingsSig = Array.isArray(bindGroupLayoutEntries)
    ? bindGroupLayoutEntries
        .map((e: any) => {
          const t = e?.buffer?.type ? String(e.buffer.type) : '';
          return `${e?.binding ?? ''}:${e?.visibility ?? ''}:${t}`;
        })
        .join('|')
    : '';
  return `${entryPoint}|${hashString(shaderCode)}|${hashString(bindingsSig)}`;
}

function makeWorkgroupVariant(shaderCode: string, workgroupSize: WorkgroupSize): string {
  const replaced = shaderCode.replace(
    /@workgroup_size\(\s*\d+\s*\)/g,
    `@workgroup_size(${workgroupSize})`,
  );
  return replaced;
}

export type { WorkgroupSize };
