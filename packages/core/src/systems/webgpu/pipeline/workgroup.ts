/**
 * Workgroup Management Utilities
 *
 * Workgroup size selection and shader code variant generation.
 */

type WorkgroupSize = 16 | 32 | 64 | 128;

/**
 * Select optimal workgroup size based on entity count
 */
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
