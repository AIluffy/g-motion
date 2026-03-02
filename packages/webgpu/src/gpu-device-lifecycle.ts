import { createDebugger } from '@g-motion/shared';
import { DeviceManager } from './device-manager';
import { getTimingHelper } from './timing-helper';
import type { DeviceInitResult } from './types';
import type { GPUFrameCoordinator } from './gpu-frame-coordinator';
import type { GPUPipelineRegistry } from './gpu-pipeline-registry';
import type { GPURuntimeState } from './gpu-runtime-state';
import type { WebGPUEngineConfig } from './engine';

const warn = createDebugger('GPUDeviceLifecycle', 'warn');

export class GPUDeviceLifecycle {
  private deviceManager: DeviceManager;
  private initPromise: Promise<DeviceInitResult> | null = null;

  constructor(
    private config: Required<WebGPUEngineConfig>,
    private runtimeState: GPURuntimeState,
    private frameCoordinator: GPUFrameCoordinator,
    private pipelineRegistry: GPUPipelineRegistry,
    private onDeviceLost: (device: GPUDevice) => void,
  ) {
    this.deviceManager = new DeviceManager(this.config);
  }

  setDeviceManager(manager: DeviceManager): void {
    this.deviceManager = manager;
  }

  get deviceManagerInstance(): DeviceManager {
    return this.deviceManager;
  }

  async initialize(): Promise<DeviceInitResult> {
    const device = this.deviceManager.getDevice();
    const adapter = this.deviceManager.getAdapter();
    if (device && adapter && this.deviceManager.getQueue()) {
      return { ok: true, device, adapter, limits: adapter.limits };
    }
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initializeInternal();
    return this.initPromise;
  }

  private async initializeInternal(): Promise<DeviceInitResult> {
    const result = await this.deviceManager.initializeDevice();
    if (!result.ok) {
      this.runtimeState.setDeviceAvailable(false);
      this.runtimeState.setInitialized(false);
      warn(result.message, { reason: result.reason, source: 'GPUDeviceLifecycle.initialize' });
      return result;
    }

    const { device } = result;
    try {
      this.pipelineRegistry.setDevice(device);
      this.frameCoordinator.setDevice(device);
      await this.pipelineRegistry.initialize();
      await this.frameCoordinator.initialize();
      void device.lost.then(() => {
        this.runtimeState.setDeviceAvailable(false);
        this.pipelineRegistry.clearPipelineCache(device);
        this.onDeviceLost(device);
      });
      this.frameCoordinator.setTimingHelper(getTimingHelper(device));
      this.runtimeState.setDeviceAvailable(true);
      this.runtimeState.setInitialized(true);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(`Failed to initialize WebGPU runtime: ${message}`, {
        source: 'GPUDeviceLifecycle.initialize',
      });
      this.runtimeState.setDeviceAvailable(false);
      this.runtimeState.setInitialized(false);
      return { ok: false, reason: 'no-device', message: 'Failed to initialize WebGPU runtime.' };
    }
  }

  destroy(): void {
    this.deviceManager.destroy();
    this.initPromise = null;
  }

  getGPUDevice(): GPUDevice | null {
    return this.deviceManager.getDevice();
  }

  getGPUQueue(): GPUQueue | null {
    return this.deviceManager.getQueue();
  }

  getGPUAdapter(): GPUAdapter | null {
    return this.deviceManager.getAdapter();
  }

  ensureDevice(): GPUDevice {
    const device = this.deviceManager.getDevice();
    if (!device) {
      warn('WebGPU device not available.', { source: 'GPUDeviceLifecycle.ensureDevice' });
      throw new Error('WebGPU device not available.');
    }
    return device;
  }
}
