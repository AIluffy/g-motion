/**
 * WebGPU Pipeline Management
 *
 * Caches and retrieves compute pipelines for different workgroup sizes.
 */

const WORKGROUP_SIZES = [16, 32, 64, 128] as const;
type WorkgroupSize = (typeof WORKGROUP_SIZES)[number];

// Pipeline cache for different workgroup sizes
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

/**
 * Cache a pipeline for a specific workgroup size
 */
export function cachePipeline(workgroupSize: number, pipeline: GPUComputePipeline): void {
  getBucket('default').pipelineCache.set(workgroupSize, pipeline);
}

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
  return (
    pipelineCache.get(selected) ??
    pipelineCache.get(64) ??
    pipelineCache.get(32) ??
    pipelineCache.get(16) ??
    pipelineCache.get(128) ??
    null
  );
}

/**
 * Clear all cached pipelines
 */
export function clearPipelineCache(): void {
  for (const b of pipelineBuckets.values()) {
    b.pipelineCache.clear();
    b.pipelineCacheKey = null;
    b.pipelineCacheDevice = null;
  }
}

export function selectWorkgroupSize(workgroupHint: number): WorkgroupSize {
  if (!Number.isFinite(workgroupHint) || workgroupHint <= 0) return 64;
  if (workgroupHint === 16 || workgroupHint === 32 || workgroupHint === 64 || workgroupHint === 128)
    return workgroupHint;

  const entityCount = Math.floor(workgroupHint);
  if (entityCount >= 1000) return 128;
  if (entityCount < 64) return 16;
  if (entityCount < 256) return 32;
  return 64;
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

export async function precompileWorkgroupPipelines(
  device: GPUDevice,
  shaderCode: string,
  bindGroupLayoutEntries: any[],
  entryPoint: string = 'main',
  cacheId: string = 'default',
): Promise<boolean> {
  const bucket = getBucket(cacheId);
  const key = buildCacheKey(shaderCode, bindGroupLayoutEntries, entryPoint);
  const hasAll =
    bucket.pipelineCache.has(16) &&
    bucket.pipelineCache.has(32) &&
    bucket.pipelineCache.has(64) &&
    bucket.pipelineCache.has(128);
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
