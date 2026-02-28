import { panic } from '@g-motion/shared';
import type { WebGPUEngineConfig } from './engine';

export class DeviceManager {
  private device: GPUDevice | null = null;
  private queue: GPUQueue | null = null;
  private adapter: GPUAdapter | null = null;
  private initPromise: Promise<void> | null = null;
  private config: Required<WebGPUEngineConfig>;

  constructor(cfg: WebGPUEngineConfig = {}) {
    this.config = {
      powerPreference: cfg.powerPreference ?? 'high-performance',
      timestampQuery: cfg.timestampQuery ?? true,
    };
  }

  setConfig(cfg: WebGPUEngineConfig = {}): void {
    this.config = {
      powerPreference: cfg.powerPreference ?? 'high-performance',
      timestampQuery: cfg.timestampQuery ?? true,
    };
  }

  async initialize(): Promise<void> {
    if (this.device && this.queue) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initializeInternal();
    return this.initPromise;
  }

  private async initializeInternal(): Promise<void> {
    if (typeof navigator === 'undefined' || !(navigator as unknown as { gpu?: unknown }).gpu) {
      panic('navigator.gpu not available; WebGPU unavailable.', {
        env: typeof navigator === 'undefined' ? 'no-navigator' : 'navigator-no-gpu',
        source: 'DeviceManager.initialize',
      });
    }

    try {
      const gpu = (
        navigator as unknown as {
          gpu: {
            requestAdapter: (options?: {
              powerPreference?: GPUPowerPreference;
            }) => Promise<GPUAdapter | null>;
          };
        }
      ).gpu;
      this.adapter = await gpu.requestAdapter({ powerPreference: this.config.powerPreference });

      if (!this.adapter) {
        panic('requestAdapter returned null; WebGPU unavailable.', {
          stage: 'adapter',
          source: 'DeviceManager.initialize',
        });
      }

      const canTimestamp =
        this.config.timestampQuery && this.adapter.features.has('timestamp-query');

      this.device = await this.adapter.requestDevice({
        requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
      });

      if (!this.device) {
        panic('requestDevice returned null; WebGPU unavailable.', {
          stage: 'device',
          source: 'DeviceManager.initialize',
        });
      }

      this.queue = this.device.queue;
    } catch (error) {
      const originalError = error instanceof Error ? error.message : String(error);
      this.device = null;
      this.queue = null;
      panic('Failed to initialize WebGPU device', {
        stage: 'device',
        source: 'DeviceManager.initialize',
        originalError,
      });
    }
  }

  destroy(): void {
    this.device = null;
    this.queue = null;
    this.adapter = null;
    this.initPromise = null;
  }

  getDevice(): GPUDevice | null {
    return this.device;
  }

  getQueue(): GPUQueue | null {
    return this.queue;
  }

  getAdapter(): GPUAdapter | null {
    return this.adapter;
  }
}
