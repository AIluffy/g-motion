/**
 * Workgroup Management Utilities
 *
 * Workgroup size selection and shader code variant generation.
 */

import { WebGPUConstants } from '../../../constants/webgpu';

type WorkgroupSize = 16 | 32 | 64 | 128;

/**
 * Select optimal workgroup size based on entity count
 */
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

/**
 * Hash string to number (FNV-1a)
 */
function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Build cache key from shader code, bindings, and entry point
 */
export function buildCacheKey(
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

/**
 * Create workgroup-size variant of shader code
 */
export function makeWorkgroupVariant(shaderCode: string, workgroupSize: WorkgroupSize): string {
  const replaced = shaderCode.replace(
    /@workgroup_size\(\s*\d+\s*\)/g,
    `@workgroup_size(${workgroupSize})`,
  );
  return replaced;
}

export type { WorkgroupSize };
