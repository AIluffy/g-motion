import type { GPUBridge } from '@g-motion/protocol';

let gpuBridge: GPUBridge | null = null;

export function registerGPUBridge(bridge: GPUBridge): void {
  gpuBridge = bridge;
}

export function getGPUBridge(): GPUBridge | null {
  return gpuBridge;
}

export function requireGPUBridge(): GPUBridge {
  if (!gpuBridge) {
    throw new Error(
      'GPUBridge not registered. Install @g-motion/webgpu and call registerGPUBridge().',
    );
  }
  return gpuBridge;
}

export function clearGPUBridge(): void {
  gpuBridge = null;
}
