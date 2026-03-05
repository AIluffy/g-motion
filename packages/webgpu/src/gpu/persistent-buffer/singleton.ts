import { PersistentGPUBufferManager } from './manager';

let globalPersistentBufferManager: PersistentGPUBufferManager | null = null;

export function getPersistentGPUBufferManager(device?: GPUDevice): PersistentGPUBufferManager {
  if (!globalPersistentBufferManager && device) {
    globalPersistentBufferManager = new PersistentGPUBufferManager(device);
  }
  if (!globalPersistentBufferManager) {
    throw new Error('PersistentGPUBufferManager not initialized');
  }
  return globalPersistentBufferManager;
}

export function resetPersistentGPUBufferManager(): void {
  if (globalPersistentBufferManager) {
    globalPersistentBufferManager.dispose();
    globalPersistentBufferManager = null;
  }
}
