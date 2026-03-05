import type { MotionPlugin } from '@g-motion/protocol';
import { SpringComponentSchema } from './physics/schema';
import springShaderCode from './shaders/spring.wgsl?raw';

// Shader definition for plugin manifest
const springShader = {
  code: springShaderCode,
  entryPoint: 'updateSprings',
  bindings: [
    { name: 'springs', type: 'storage' as const, access: 'read_write' as const },
    { name: 'params', type: 'uniform' as const },
    { name: 'outputs', type: 'storage' as const, access: 'read_write' as const },
    { name: 'settled', type: 'storage' as const, access: 'read_write' as const },
  ],
};

/**
 * Spring Plugin - GPU-only spring physics plugin
 *
 * All spring physics are handled by the GPU through the batch processing pipeline:
 * batch/sampling.ts → physics-dispatch-system.ts → GPU Shader → readback → delivery
 *
 * No CPU fallback is provided. WebGPU must be available.
 */
export const springPlugin: MotionPlugin = {
  name: 'spring',
  version: '0.0.0',
  manifest: {
    components: {
      Spring: { schema: SpringComponentSchema },
    },
    shaders: {
      spring: springShader,
    },
  },
};


// Re-export all exports from sub-modules
export { SpringComponentSchema } from './physics/schema';
export { analyzeSpringTracks, buildSpringComponent } from './physics/tracks';
export type { SpringOptions, SpringComponentData } from './types';

// Re-export shader code for external use
export { default as SPRING_GPU_SHADER } from './shaders/spring.wgsl?raw';

// Re-export spring utilities
export { SPRING_PRESETS, calculateCriticalDamping } from './physics/schema';
