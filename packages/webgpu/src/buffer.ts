export { BufferManager } from './gpu/buffer-manager';
export { PersistentGPUBufferManager, DirtyRegionTracker } from './gpu/persistent-buffer-manager';
export { StagingBufferPool } from './gpu/staging-pool';
export { acquirePooledOutputBuffer, releasePooledOutputBuffer } from './gpu/output-buffer-pool';

export type { OutputBufferReadbackTag } from './gpu/output-buffer-pool';
export type { StagingBufferEntry } from './gpu/staging-pool';
