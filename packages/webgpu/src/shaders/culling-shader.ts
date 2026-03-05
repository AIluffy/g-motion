/**
 * Batch Culling GPU Shader (Phase 1.3)
 *
 * GPU-accelerated entity visibility culling to reduce CPU-GPU data transfer.
 * Determines which entities need rendering based on version changes and status.
 */

import cullingShaderCode from './culling.wgsl?raw';
import advancedCullingShaderCode from './culling-advanced.wgsl?raw';
import advancedCullingOutputCompactShaderCode from './culling-advanced-output-compact.wgsl?raw';
import compactionShaderCode from './culling-compaction.wgsl?raw';

// WGSL shader for entity culling
export const CULLING_SHADER = cullingShaderCode;

// Advanced culling shader with frustum and temporal culling
export const ADVANCED_CULLING_SHADER = advancedCullingShaderCode;

export const ADVANCED_CULLING_OUTPUT_COMPACT_SHADER = advancedCullingOutputCompactShaderCode;

// Stream compaction shader to pack visible entities
export const COMPACTION_SHADER = compactionShaderCode;

/**
 * RenderState data layout for CPU packing
 */
export interface RenderStateData {
  entityId: number;
  version: number;
  renderedVersion: number;
  status: number;
  rendererCode: number;
}

/**
 * Extended RenderState with bounds for advanced culling
 */
export interface RenderStateExData extends RenderStateData {
  animationEndTime?: number;
  currentTime?: number;
  bounds?: {
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
  };
}

/**
 * Culling result from GPU
 */
export interface CullResultData {
  entityId: number;
  visible: boolean;
  rendererCode: number;
  outputIndex: number;
  cullReason?: number;
}

// Data layout constants
export const RENDER_STATE_STRIDE = 8; // 8 u32s per state
export const RENDER_STATE_EX_STRIDE = 8; // 8 values per extended state
export const ENTITY_BOUNDS_STRIDE = 4; // 4 floats per bounds
export const FRUSTUM_PLANES_FLOATS = 24; // 6 vec4<f32>
export const CULL_RESULT_STRIDE = 4; // 4 u32s per result
export const CULL_RESULT_EX_STRIDE = 8; // 8 u32s per extended result
export const COMPACTED_ENTITY_STRIDE = 4; // 4 u32s per compacted entity

/**
 * Pack RenderState data for GPU upload
 */
export function packRenderStates(states: RenderStateData[]): Uint32Array {
  const data = new Uint32Array(states.length * RENDER_STATE_STRIDE);
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    const offset = i * RENDER_STATE_STRIDE;
    data[offset + 0] = s.entityId;
    data[offset + 1] = s.version;
    data[offset + 2] = s.renderedVersion;
    data[offset + 3] = s.status;
    data[offset + 4] = s.rendererCode;
    data[offset + 5] = 0; // padding
    data[offset + 6] = 0; // padding
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Unpack culling results from GPU
 */
export function unpackCullResults(data: Uint32Array, count: number): CullResultData[] {
  const results: CullResultData[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * CULL_RESULT_STRIDE;
    results.push({
      entityId: data[offset + 0],
      visible: data[offset + 1] === 1,
      rendererCode: data[offset + 2],
      outputIndex: data[offset + 3],
    });
  }
  return results;
}

/**
 * Get visible entity IDs from culling results
 */
export function getVisibleEntityIds(results: CullResultData[]): number[] {
  return results.filter((r) => r.visible).map((r) => r.entityId);
}

/**
 * Group visible entities by renderer code
 */
export function groupByRenderer(
  results: CullResultData[],
): Map<number, { entityId: number; outputIndex: number }[]> {
  const groups = new Map<number, { entityId: number; outputIndex: number }[]>();

  for (const r of results) {
    if (!r.visible) continue;

    let group = groups.get(r.rendererCode);
    if (!group) {
      group = [];
      groups.set(r.rendererCode, group);
    }
    group.push({ entityId: r.entityId, outputIndex: r.outputIndex });
  }

  return groups;
}
