/**
 * Physics GPU Shader (Phase 2.1)
 *
 * GPU-accelerated physics simulations for Spring and Inertia animations.
 * Provides smooth, physically-based motion with configurable parameters.
 */

import springShaderCode from './shaders/physics-spring.wgsl?raw';
import inertiaShaderCode from './shaders/physics-inertia.wgsl?raw';
import physicsCombinedShaderCode from './shaders/physics-combined.wgsl?raw';

// WGSL shader for Spring physics
export const SPRING_SHADER = springShaderCode;

// WGSL shader for Inertia physics
export const INERTIA_SHADER = inertiaShaderCode;

// Combined physics shader with both spring and inertia
export const PHYSICS_COMBINED_SHADER = physicsCombinedShaderCode;

/**
 * Spring state data for CPU packing
 */
export interface SpringStateData {
  position: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
  mass: number;
  restLength?: number;
}

/**
 * Inertia state data for CPU packing
 */
export interface InertiaStateData {
  position: number;
  velocity: number;
  friction: number;
  bounciness?: number;
  minBound?: number;
  maxBound?: number;
}

/**
 * Simulation parameters
 */
export interface PhysicsSimParams {
  deltaTime: number;
  maxVelocity?: number;
  settleThreshold?: number;
}

// Data layout constants
export const SPRING_STATE_STRIDE = 8;
export const INERTIA_STATE_STRIDE = 8;
export const PHYSICS_STATE_STRIDE = 16;
export const SIM_PARAMS_SIZE = 16; // 4 floats

/**
 * Pack spring states for GPU upload
 */
export function packSpringStates(springs: SpringStateData[]): Float32Array {
  const data = new Float32Array(springs.length * SPRING_STATE_STRIDE);
  for (let i = 0; i < springs.length; i++) {
    const s = springs[i];
    const offset = i * SPRING_STATE_STRIDE;
    data[offset + 0] = s.position;
    data[offset + 1] = s.velocity;
    data[offset + 2] = s.target;
    data[offset + 3] = s.stiffness;
    data[offset + 4] = s.damping;
    data[offset + 5] = s.mass;
    data[offset + 6] = s.restLength ?? 0;
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Pack inertia states for GPU upload
 */
export function packInertiaStates(inertias: InertiaStateData[]): Float32Array {
  const data = new Float32Array(inertias.length * INERTIA_STATE_STRIDE);
  for (let i = 0; i < inertias.length; i++) {
    const s = inertias[i];
    const offset = i * INERTIA_STATE_STRIDE;
    data[offset + 0] = s.position;
    data[offset + 1] = s.velocity;
    data[offset + 2] = s.friction;
    data[offset + 3] = s.bounciness ?? 0;
    data[offset + 4] = s.minBound ?? 0;
    data[offset + 5] = s.maxBound ?? 0;
    data[offset + 6] = 0; // padding
    data[offset + 7] = 0; // padding
  }
  return data;
}

/**
 * Pack simulation parameters for GPU upload
 */
export function packSimParams(params: PhysicsSimParams): Float32Array {
  return new Float32Array([
    params.deltaTime,
    params.maxVelocity ?? 10000,
    params.settleThreshold ?? 0.001,
    0, // padding
  ]);
}

/**
 * Unpack spring states from GPU
 */
export function unpackSpringStates(data: Float32Array): SpringStateData[] {
  const count = data.length / SPRING_STATE_STRIDE;
  const results: SpringStateData[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * SPRING_STATE_STRIDE;
    results.push({
      position: data[offset + 0],
      velocity: data[offset + 1],
      target: data[offset + 2],
      stiffness: data[offset + 3],
      damping: data[offset + 4],
      mass: data[offset + 5],
      restLength: data[offset + 6],
    });
  }
  return results;
}

/**
 * Calculate critical damping for a spring
 * Critical damping = 2 * sqrt(stiffness * mass)
 */
export function calculateCriticalDamping(stiffness: number, mass: number): number {
  return 2 * Math.sqrt(stiffness * mass);
}

/**
 * Create spring preset configurations
 */
export const SPRING_PRESETS = {
  // Gentle spring (slow, smooth)
  gentle: { stiffness: 100, damping: 20, mass: 1 },
  // Default spring (balanced)
  default: { stiffness: 170, damping: 26, mass: 1 },
  // Wobbly spring (bouncy)
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  // Stiff spring (fast, snappy)
  stiff: { stiffness: 210, damping: 20, mass: 1 },
  // Slow spring (very smooth)
  slow: { stiffness: 280, damping: 60, mass: 1 },
  // Molasses (very slow)
  molasses: { stiffness: 280, damping: 120, mass: 1 },
} as const;
