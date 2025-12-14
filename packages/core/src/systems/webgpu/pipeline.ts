/**
 * WebGPU Pipeline Management
 *
 * Caches and retrieves compute pipelines for different workgroup sizes.
 */

// Pipeline cache for different workgroup sizes
let pipelineCache: Map<number, any> = new Map(); // WG size → Pipeline

/**
 * Cache a pipeline for a specific workgroup size
 */
export function cachePipeline(workgroupSize: number, pipeline: any): void {
  pipelineCache.set(workgroupSize, pipeline);
}

/**
 * Get or retrieve pipeline for a given workgroup size
 * Currently caches only the default 64; future enhancement can precompile all 4
 */
export async function getPipelineForWorkgroup(
  _device: any,
  workgroupSize: number,
): Promise<any | null> {
  // Return cached pipeline if available
  if (pipelineCache.has(workgroupSize)) {
    return pipelineCache.get(workgroupSize);
  }

  // For MVP, only support WG=64; others fall back to 64
  // Future: precompile 16/32/64/128 variants
  if (pipelineCache.has(64)) {
    return pipelineCache.get(64);
  }

  return null;
}

/**
 * Clear all cached pipelines
 */
export function clearPipelineCache(): void {
  pipelineCache.clear();
}
