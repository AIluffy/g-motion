/**
 * WebGPU Timestamp Query Helper
 * Based on: https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html
 *
 * Provides GPU timing via timestamp queries for compute and render passes.
 * Handles feature detection, state management, and async result retrieval.
 */

import { GPUTimestampQueryManager } from './timestamp';

export type TimingToken = { index: number; encoder: GPUCommandEncoder };

/**
 * Compatibility wrapper for GPUTimestampQueryManager.
 */
export class TimingHelper {
  private manager: GPUTimestampQueryManager;
  private legacyToken: TimingToken | null = null;

  constructor(device: GPUDevice) {
    this.manager = new GPUTimestampQueryManager(device);
  }

  hasTimestampSupport(): boolean {
    return this.manager.hasSupport();
  }

  beginFrame(): void {
    this.manager.beginFrame();
  }

  beginComputePass(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor = {},
  ): GPUComputePassEncoder {
    const { pass, token } = this.beginComputePassWithToken(encoder, descriptor);
    this.legacyToken = token;
    return pass;
  }

  beginComputePassWithToken(
    encoder: GPUCommandEncoder,
    descriptor: GPUComputePassDescriptor = {},
  ): { pass: GPUComputePassEncoder; token: TimingToken | null } {
    const queryIndex = this.manager.injectTimestampWrites(descriptor);
    const pass = encoder.beginComputePass(descriptor);
    return { pass, token: queryIndex !== null ? { index: queryIndex, encoder } : null };
  }

  async getResult(): Promise<number> {
    const token = this.legacyToken;
    this.legacyToken = null;
    if (!token) return 0;
    return this.getResultForToken(token);
  }

  async getResultForToken(token: TimingToken): Promise<number> {
    const result = await this.manager.resolveAndReadback(token.encoder, token.index);
    return result?.durationNs ?? 0;
  }
}

let sharedTimingHelper: TimingHelper | null = null;
let sharedDevice: GPUDevice | null = null;

/**
 * Singleton accessor to avoid repeated TimingHelper initialization.
 */
export function getTimingHelper(device: GPUDevice): TimingHelper {
  if (sharedTimingHelper && sharedDevice === device) {
    return sharedTimingHelper;
  }

  sharedTimingHelper = new TimingHelper(device);
  sharedDevice = device;
  return sharedTimingHelper;
}

export { NonNegativeRollingAverage } from '@g-motion/shared';
