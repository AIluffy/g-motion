/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Performance Optimization and GPU/CPU Synchronization
 *
 * Handles data transfer optimization, synchronization barriers,
 * and performance monitoring for compute shader execution.
 */

/**
 * GPU-CPU synchronization event
 */
export interface SyncEvent {
  type: 'upload' | 'compute' | 'download' | 'barrier';
  timestamp: number;
  duration: number;
  dataSize?: number;
}

/**
 * Performance metrics tracking
 */
export interface PerformanceMetrics {
  uploadTime: number;
  computeTime: number;
  downloadTime: number;
  totalTime: number;
  dataTransferred: number;
  uploadBandwidth: number;
  downloadBandwidth: number;
  readbackTimeMs?: number; // Phase 3 metric
  readbackPercentage?: number; // % of total frame
}

/**
 * Synchronization barrier configuration
 */
export interface SyncBarrierConfig {
  enableFencing?: boolean; // GPU-side fencing
  enableCPUSideWait?: boolean; // CPU busy-wait for GPU completion
  timeoutMs?: number; // Maximum wait time
}

/**
 * GPU-CPU Synchronization Manager
 * Coordinates data transfers and ensures proper sync between GPU compute and CPU
 */
export class SyncManager {
  private syncEvents: SyncEvent[] = [];
  private metrics: PerformanceMetrics = {
    uploadTime: 0,
    computeTime: 0,
    downloadTime: 0,
    totalTime: 0,
    dataTransferred: 0,
    uploadBandwidth: 0,
    downloadBandwidth: 0,
  };

  /**
   * Record a synchronization event
   */
  recordEvent(event: Omit<SyncEvent, 'timestamp'>): void {
    this.syncEvents.push({
      ...event,
      timestamp: Date.now(),
    });

    // Update metrics
    if (event.type === 'upload') {
      this.metrics.uploadTime += event.duration;
      if (event.dataSize) {
        this.metrics.dataTransferred += event.dataSize;
        this.metrics.uploadBandwidth = (event.dataSize / event.duration) * 1000; // bytes/sec
      }
    } else if (event.type === 'compute') {
      this.metrics.computeTime += event.duration;
    } else if (event.type === 'download') {
      this.metrics.downloadTime += event.duration;
      if (event.dataSize) {
        this.metrics.downloadBandwidth = (event.dataSize / event.duration) * 1000; // bytes/sec
      }
    }

    this.metrics.totalTime =
      this.metrics.uploadTime + this.metrics.computeTime + this.metrics.downloadTime;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get synchronization events
   */
  getEvents(): readonly SyncEvent[] {
    return Object.freeze([...this.syncEvents]);
  }

  /**
   * Clear events and reset metrics
   */
  clear(): void {
    this.syncEvents = [];
    this.metrics = {
      uploadTime: 0,
      computeTime: 0,
      downloadTime: 0,
      totalTime: 0,
      dataTransferred: 0,
      uploadBandwidth: 0,
      downloadBandwidth: 0,
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const metrics = this.metrics;
    return `
Performance Report:
  Upload Time: ${metrics.uploadTime.toFixed(2)}ms
  Compute Time: ${metrics.computeTime.toFixed(2)}ms
  Download Time: ${metrics.downloadTime.toFixed(2)}ms
  Total Time: ${metrics.totalTime.toFixed(2)}ms
  Data Transferred: ${(metrics.dataTransferred / 1024 / 1024).toFixed(2)}MB
  Upload Bandwidth: ${(metrics.uploadBandwidth / 1024 / 1024).toFixed(2)}MB/s
  Download Bandwidth: ${(metrics.downloadBandwidth / 1024 / 1024).toFixed(2)}MB/s
  Upload Ratio: ${((metrics.uploadTime / metrics.totalTime) * 100).toFixed(1)}%
  Compute Ratio: ${((metrics.computeTime / metrics.totalTime) * 100).toFixed(1)}%
  Download Ratio: ${((metrics.downloadTime / metrics.totalTime) * 100).toFixed(1)}%
    `.trim();
  }

  /**
   * Check if GPU should fallback to CPU based on frame budget
   * @param frameBudgetMs - Frame time threshold (default 12ms for 60fps with headroom)
   * @returns true if should fallback to CPU
   */
  shouldFallbackToCPU(frameBudgetMs: number = 12): boolean {
    if (this.metrics.totalTime === 0) return false;
    return this.metrics.totalTime > frameBudgetMs;
  }

  /**
   * Get average frame time for adaptive threshold calculation
   */
  getAverageFrameTime(): number {
    return this.metrics.totalTime;
  }
}

/**
 * Data Transfer Optimizer
 * Minimizes GPU-CPU data transfers through caching and batching
 */
export class DataTransferOptimizer {
  private uploadCache = new Map<string, Float32Array>();
  private downloadCache = new Map<string, Float32Array>();
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Check if data is cached (avoiding redundant uploads)
   */
  isCached(key: string): boolean {
    return this.uploadCache.has(key);
  }

  /**
   * Cache uploaded data
   */
  cacheUpload(key: string, data: Float32Array): void {
    this.uploadCache.set(key, data);
  }

  /**
   * Get cached upload data
   */
  getCachedUpload(key: string): Float32Array | null {
    const data = this.uploadCache.get(key);
    if (data) {
      this.cacheHits += 1;
    } else {
      this.cacheMisses += 1;
    }
    return data || null;
  }

  /**
   * Cache download results
   */
  cacheDownload(key: string, data: Float32Array): void {
    this.downloadCache.set(key, data);
  }

  /**
   * Get cached download data
   */
  getCachedDownload(key: string): Float32Array | null {
    return this.downloadCache.get(key) || null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? (this.cacheHits / total) * 100 : 0,
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.uploadCache.clear();
    this.downloadCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

/**
 * Compute Pipeline Orchestrator
 * Coordinates GPU compute execution with optimal synchronization
 */
export class ComputeOrchestrator {
  private syncManager: SyncManager;
  private dataOptimizer: DataTransferOptimizer;

  constructor(queue: any) {
    // queue reserved for future async GPU operations tracking
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    queue;
    this.syncManager = new SyncManager();
    this.dataOptimizer = new DataTransferOptimizer();
  }

  /**
   * Execute compute with full instrumentation
   */
  async executeWithSync(
    uploadFn: () => Promise<number>,
    computeFn: () => Promise<number>,
    downloadFn?: () => Promise<number>,
    _config?: SyncBarrierConfig,
  ): Promise<PerformanceMetrics> {
    // Async execution tracking (startTime reserved for future wallclock metrics)
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    performance.now();

    // Upload phase
    const uploadStart = performance.now();
    const uploadSize = await uploadFn();
    const uploadDuration = performance.now() - uploadStart;
    this.syncManager.recordEvent({
      type: 'upload',
      duration: uploadDuration,
      dataSize: uploadSize,
    });

    // Compute phase
    const computeStart = performance.now();
    await computeFn();
    const computeDuration = performance.now() - computeStart;
    this.syncManager.recordEvent({
      type: 'compute',
      duration: computeDuration,
    });

    // Optional download phase
    if (downloadFn) {
      const downloadStart = performance.now();
      const downloadSize = await downloadFn();
      const downloadDuration = performance.now() - downloadStart;
      this.syncManager.recordEvent({
        type: 'download',
        duration: downloadDuration,
        dataSize: downloadSize,
      });
    }

    return this.syncManager.getMetrics();
  }

  /**
   * Get synchronization manager
   */
  getSyncManager(): SyncManager {
    return this.syncManager;
  }

  /**
   * Get data transfer optimizer
   */
  getDataOptimizer(): DataTransferOptimizer {
    return this.dataOptimizer;
  }

  /**
   * Generate full performance report
   */
  generateFullReport(): string {
    const cacheStats = this.dataOptimizer.getCacheStats();
    return `
${this.syncManager.generateReport()}

Cache Statistics:
  Cache Hits: ${cacheStats.hits}
  Cache Misses: ${cacheStats.misses}
  Hit Rate: ${cacheStats.hitRate.toFixed(1)}%
    `.trim();
  }
}

// --- GPU result delivery queue (Phase 1: primitive channel) ---
export type GPUResultPacket = {
  archetypeId: string;
  entityIds: ArrayLike<number>;
  values: Float32Array; // one value per entity (primitive)
  // Phase 4: Multi-channel support
  stride?: number; // values per entity (default 1)
  channels?: Array<{ index: number; property: string }>; // channel mapping (optional)
};

const _resultQueue: GPUResultPacket[] = [];

export function enqueueGPUResults(p: GPUResultPacket): void {
  _resultQueue.push(p);
}

export function drainGPUResults(): GPUResultPacket[] {
  if (_resultQueue.length === 0) return [];
  const out = _resultQueue.slice();
  _resultQueue.length = 0;
  return out;
}
