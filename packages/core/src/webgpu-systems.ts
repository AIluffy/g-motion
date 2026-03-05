import type { SystemContext, SystemDef } from './runtime/plugin';

const ORCHESTRATION_MODULE = '@g-motion/webgpu/orchestration';

async function loadOrchestration(): Promise<Record<string, unknown>> {
  try {
    // Keep this as runtime-loaded to avoid hard package coupling in core.
    return await import(ORCHESTRATION_MODULE);
  } catch {
    throw new Error(
      "Deprecated bridge '@g-motion/core/webgpu-systems' requires '@g-motion/webgpu/orchestration'.",
    );
  }
}

function createSystemProxy(name: string, order: number): SystemDef {
  return {
    name,
    order,
    update(dt: number, ctx?: SystemContext) {
      return loadOrchestration().then((mod) => {
        const target = mod[name] as SystemDef | undefined;
        if (!target || typeof target.update !== 'function') {
          throw new Error(`Export '${name}' is not available in '@g-motion/webgpu/orchestration'.`);
        }
        return target.update(dt, ctx);
      });
    },
  };
}

/** @deprecated Import from '@g-motion/webgpu/orchestration' instead. */
export const WebGPUComputeSystem = createSystemProxy('WebGPUComputeSystem', 6);

/** @deprecated Import from '@g-motion/webgpu/orchestration' instead. */
export const GPUResultApplySystem = createSystemProxy('GPUResultApplySystem', 28);
