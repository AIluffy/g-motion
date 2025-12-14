// Since plugins depends on core, we need to ensure the types are available.
// In a monorepo, we assume @g-motion/core is available.
// For now, I will define the shape to match the interface.

export const TransformComponent = {
  schema: {
    x: 'float32',
    y: 'float32',
    z: 'float32',
    scaleX: 'float32',
    scaleY: 'float32',
    scaleZ: 'float32',
    rotate: 'float32',
    rotateX: 'float32',
    rotateY: 'float32',
    rotateZ: 'float32',
    perspective: 'float32',
  },
} as const;
