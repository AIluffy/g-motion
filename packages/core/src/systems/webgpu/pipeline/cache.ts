/**
 * Pipeline Cache Management
 *
 * Manages pipeline buckets for different workgroup sizes.
 */

type WorkgroupSize = 16 | 32 | 64 | 128;

// Pipeline cache for different workgroup sizes
type PipelineBucket = {
  pipelineCache: Map<number, GPUComputePipeline>;
  pipelineCacheKey: string | null;
  pipelineCacheDevice: GPUDevice | null;
};

const pipelineBuckets = new Map<string, PipelineBucket>();

/**
 * Get or create pipeline bucket for a given cache ID
 */
export function getBucket(cacheId: string = 'default'): PipelineBucket {
  let b = pipelineBuckets.get(cacheId);
  if (!b) {
    b = {
      pipelineCache: new Map(),
      pipelineCacheKey: null,
      pipelineCacheDevice: null,
    };
    pipelineBuckets.set(cacheId, b);
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
 * Clear all cached pipelines
 */
export function clearPipelineCache(): void {
  for (const b of pipelineBuckets.values()) {
    b.pipelineCache.clear();
    b.pipelineCacheKey = null;
    b.pipelineCacheDevice = null;
  }
}

export type { WorkgroupSize, PipelineBucket };
