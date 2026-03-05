import type { MotionPlugin } from '@g-motion/protocol';
import { registerPlugin } from '@g-motion/protocol';
import { InertiaComponentSchema } from './physics/schema';
import inertiaShaderCode from './shaders/inertia.wgsl?raw';

// Shader definition for plugin manifest
const inertiaShader = {
  code: inertiaShaderCode,
  entryPoint: 'updateInertia',
  bindings: [
    { name: 'inertias', type: 'storage' as const, access: 'read_write' as const },
    { name: 'params', type: 'uniform' as const },
    { name: 'outputs', type: 'storage' as const, access: 'read_write' as const },
    { name: 'stopped', type: 'storage' as const, access: 'read_write' as const },
  ],
};

/**
 * Inertia Plugin - GPU-only inertia physics plugin
 *
 * All inertia physics are handled by the GPU through the batch processing pipeline:
 * batch/sampling.ts → physics-dispatch-system.ts → GPU Shader → readback → delivery
 *
 * No CPU fallback is provided. WebGPU must be available.
 */
export const inertiaPlugin: MotionPlugin = {
  name: 'inertia',
  version: '0.0.0',
  manifest: {
    components: {
      Inertia: { schema: InertiaComponentSchema },
    },
    shaders: {
      inertia: inertiaShader,
    },
  },
};

// Auto-register plugin for auto-discovery
registerPlugin(inertiaPlugin);

// Re-export all exports from sub-modules
export { InertiaComponentSchema } from './physics/schema';
export { VelocityTracker } from './physics/velocity';
export { analyzeInertiaTracks, buildInertiaComponent } from './physics/tracks';
export type { InertiaOptions } from '@g-motion/shared/types';

// Re-export shader code for external use
export { default as INERTIA_GPU_SHADER } from './shaders/inertia.wgsl?raw';
