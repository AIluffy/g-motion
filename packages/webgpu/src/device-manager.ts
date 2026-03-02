import { createDebugger } from '@g-motion/shared';
import type { WebGPUEngineConfig } from './engine';
import type { DeviceInitResult } from './types';

const warn = createDebugger('DeviceManager', 'warn');

export class DeviceManager {
  private device: GPUDevice | null = null;
  private queue: GPUQueue | null = null;
  private adapter: GPUAdapter | null = null;
  private initPromise: Promise<DeviceInitResult> | null = null;
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

  async initializeDevice(): Promise<DeviceInitResult> {
    if (this.device && this.queue && this.adapter) {
      return {
        ok: true,
        device: this.device,
        adapter: this.adapter,
        limits: this.adapter.limits,
      };
    }
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initializeInternal();
    return this.initPromise;
  }

  async initializeDeviceOrThrow(): Promise<GPUDevice> {
    const result = await this.initializeDevice();
    if (result.ok) return result.device;
    throw new Error(result.message);
  }

  private async initializeInternal(): Promise<DeviceInitResult> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      const message = 'navigator.gpu not available; WebGPU unavailable.';
      warn(message, {
        env: typeof navigator === 'undefined' ? 'no-navigator' : 'navigator-no-gpu',
        source: 'DeviceManager.initializeDevice',
      });
      return { ok: false, reason: 'no-webgpu', message };
    }

    try {
      const gpu = navigator.gpu;
      this.adapter = await gpu.requestAdapter({ powerPreference: this.config.powerPreference });

      if (!this.adapter) {
        const message = 'requestAdapter returned null; WebGPU unavailable.';
        warn(message, {
          stage: 'adapter',
          source: 'DeviceManager.initializeDevice',
        });
        return { ok: false, reason: 'no-adapter', message };
      }

      const canTimestamp =
        this.config.timestampQuery && this.adapter.features.has('timestamp-query');

      const requiredFeatures: GPUFeatureName[] = [];
      if (canTimestamp) {
        requiredFeatures.push('timestamp-query');
      }

      this.device = await this.adapter.requestDevice({
        requiredFeatures,
      });

      if (!this.device) {
        const message = 'requestDevice returned null; WebGPU unavailable.';
        warn(message, {
          stage: 'device',
          source: 'DeviceManager.initializeDevice',
        });
        return { ok: false, reason: 'no-device', message };
      }

      this.queue = this.device.queue;
      const currentDevice = this.device;
      void currentDevice.lost.then((info) => {
        const message = info?.message
          ? `WebGPU device lost: ${info.message}`
          : 'WebGPU device lost.';
        warn(message, {
          reason: info?.reason ?? 'unknown',
          source: 'DeviceManager.deviceLost',
        });
        if (this.device === currentDevice) {
          this.device = null;
          this.queue = null;
        }
      });
      return {
        ok: true,
        device: currentDevice,
        adapter: this.adapter,
        limits: this.adapter.limits,
      };
    } catch (error) {
      const originalError = error instanceof Error ? error.message : String(error);
      this.device = null;
      this.queue = null;
      const message = `Failed to initialize WebGPU device: ${originalError}`;
      warn(message, {
        stage: 'device',
        source: 'DeviceManager.initializeDevice',
        originalError,
      });
      return { ok: false, reason: 'no-device', message };
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
