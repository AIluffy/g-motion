/**
 * Batch Processing Type Definitions
 *
 * Core interfaces for batch entity management, keyframe data,
 * results handling, and GPU batch configuration.
 */

/**
 * Batch entity data
 */
export interface BatchEntity {
  id: number;
  startTime: number;
  currentTime: number;
  playbackRate: number;
  status: number; // 0: Idle, 1: Running, 2: Paused, 3: Finished
}

/**
 * Batch keyframe data
 */
export interface BatchKeyframe {
  entityId: number;
  startTime: number;
  duration: number;
  startValue: number;
  endValue: number;
  easingId: number;
}

/**
 * Batch results
 */
export interface BatchResult {
  entityId: number;
  interpolatedValue: number;
  timestamp: number;
}

/**
 * Batch metadata
 */
export interface BatchMetadata {
  batchId: string;
  entityCount: number;
  createdAt: number;
  gpu?: boolean; // Whether this batch was processed on GPU
  processingTime?: number;
}

/**
 * GPU batch configuration
 */
export interface GPUBatchConfig {
  maxBatchSize?: number; // Default: 1024 per archetype
  usePersistentBuffers?: boolean; // Default: false (use shared pool)
  enableDataTransferOptimization?: boolean; // Default: true
  enableResultCaching?: boolean; // Default: true
}
