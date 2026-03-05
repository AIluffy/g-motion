/**
 * Physics GPU Shader (Phase 2.1)
 *
 * GPU-accelerated physics simulations for Spring and Inertia animations.
 * Provides smooth, physically-based motion with configurable parameters.
 *
 * NOTE: Individual spring/inertia shaders have been moved to their respective plugins.
 * This file contains the combined physics shader and general utility functions.
 */

import { WebGPUConstants } from '@g-motion/shared';
import physicsCombinedShaderCode from './physics-combined.wgsl?raw';

// Combined physics shader with both spring and inertia (core infrastructure)
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
export const SPRING_STATE_STRIDE = WebGPUConstants.BUFFER.STRIDE_SPRING_STATE;
export const INERTIA_STATE_STRIDE = WebGPUConstants.BUFFER.STRIDE_INERTIA_STATE;
export const PHYSICS_STATE_STRIDE = WebGPUConstants.BUFFER.STRIDE_PHYSICS_STATE;
export const SIM_PARAMS_SIZE = WebGPUConstants.BUFFER.STRIDE_SIM_PARAMS_FLOATS * 4;

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
    params.maxVelocity ?? WebGPUConstants.GPU.PHYSICS_MAX_VELOCITY_DEFAULT,
    params.settleThreshold ?? WebGPUConstants.GPU.PHYSICS_SETTLE_THRESHOLD_DEFAULT,
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
