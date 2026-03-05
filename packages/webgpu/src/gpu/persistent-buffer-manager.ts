import { crc32 } from '../stream/crc32';

/**
 * Persistent GPU Buffer Manager
 *
 * Manages persistent GPU buffers to avoid per-frame allocation/deallocation.
 * Implements intelligent buffer reuse, growth strategies, and change detection.
 *
 * Performance benefits:
 * - Eliminates per-frame buffer creation overhead
 * - Reduces GPU memory fragmentation
 * - Enables incremental updates (upload only changed data)
 * - Supports double-buffering for async operations
 */

export interface BufferDescriptor {
  size: number;
  usage: GPUBufferUsageFlags;
  label?: string;
}

export interface PersistentBuffer {
  buffer: GPUBuffer;
  size: number;
  usage: GPUBufferUsageFlags;
  lastUsedFrame: number;
  version: number; // Track content version for incremental updates
  isDirty: boolean; // Needs upload
  label?: string;
  contentVersion?: number; // Content version for fast change detection (P0-2 optimization)
}

export interface BufferUpdateDescriptor {
  data: ArrayBufferView;
  offset?: number; // Byte offset for partial updates
  size?: number; // Byte size for partial updates
}

export interface IncrementalUpdateStats {
  totalUpdates: number;
  incrementalUpdates: number;
  bytesSkipped: number;
  totalBytesProcessed: number;
}

export interface BufferAlignmentConfig {
  smallThresholdBytes: number;
  mediumThresholdBytes: number;
  smallAlignmentBytes: number;
  mediumAlignmentBytes: number;
  largeAlignmentBytes: number;
}

export interface DirtyRegion {
  offset: number;
  length: number;
}

const WRITE_BUFFER_ALIGNMENT = 4;
const PARTIAL_UPLOAD_FALLBACK_RATIO = 0.35;

export class DirtyRegionTracker {
  private regions: DirtyRegion[] = [];

  markDirty(byteOffset: number, byteLength: number): void {
    if (byteLength <= 0) {
      return;
    }

    const alignedStart = Math.floor(byteOffset / WRITE_BUFFER_ALIGNMENT) * WRITE_BUFFER_ALIGNMENT;
    const alignedEnd =
      Math.ceil((byteOffset + byteLength) / WRITE_BUFFER_ALIGNMENT) * WRITE_BUFFER_ALIGNMENT;

    let nextStart = alignedStart;
    let nextEnd = alignedEnd;
    const merged: DirtyRegion[] = [];
    let inserted = false;

    for (const region of this.regions) {
      const regionEnd = region.offset + region.length;
      if (regionEnd < nextStart) {
        merged.push(region);
        continue;
      }
      if (nextEnd < region.offset) {
        if (!inserted) {
          merged.push({ offset: nextStart, length: nextEnd - nextStart });
          inserted = true;
        }
        merged.push(region);
        continue;
      }

      nextStart = Math.min(nextStart, region.offset);
      nextEnd = Math.max(nextEnd, regionEnd);
    }

    if (!inserted) {
      merged.push({ offset: nextStart, length: nextEnd - nextStart });
    }

    this.regions = merged;
  }

  getDirtyRegions(): DirtyRegion[] {
    return this.regions.map((region) => ({ ...region }));
  }

  clear(): void {
    this.regions = [];
  }
}

const defaultBufferAlignmentConfig: BufferAlignmentConfig = {
  smallThresholdBytes: 1024,
  mediumThresholdBytes: 64 * 1024,
  smallAlignmentBytes: 64,
  mediumAlignmentBytes: 256,
  largeAlignmentBytes: 4096,
};

let bufferAlignmentConfig: BufferAlignmentConfig = {
  ...defaultBufferAlignmentConfig,
};

export function getBufferAlignmentConfig(): BufferAlignmentConfig {
  return bufferAlignmentConfig;
}

export function setBufferAlignmentConfig(overrides: Partial<BufferAlignmentConfig>): void {
  bufferAlignmentConfig = {
    ...bufferAlignmentConfig,
    ...overrides,
  };
}

/**
 * Persistent GPU Buffer Manager
 *
 * Key features:
 * - Buffer pooling and reuse across frames
 * - Automatic growth when size requirements increase
 * - Change detection for incremental updates
 * - Double-buffering support for async operations
 * - Automatic cleanup of unused buffers
 */
export class PersistentGPUBufferManager {
  private device: GPUDevice;
  private buffers = new Map<string, PersistentBuffer>();
  private previousData = new Map<string, Uint8Array>(); // For change detection
  private previousUploadBytes = new Map<string, Uint8Array>();
  private previousDataHash = new Map<string, number>();
  private previousDataLength = new Map<string, number>();
  private currentFrame = 0;
  private readonly recycleThreshold = 120; // Frames (~2 seconds at 60fps)
  private stats: IncrementalUpdateStats = {
    totalUpdates: 0,
    incrementalUpdates: 0,
    bytesSkipped: 0,
    totalBytesProcessed: 0,
  };
  private peakMemoryBytes = 0;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Get or create a persistent buffer for the given key
   *
   * @param key - Unique identifier (e.g., "states:archetypeId")
   * @param data - Data to upload
   * @param usage - GPU buffer usage flags
   * @param options - Optional configuration
   * @returns GPU buffer ready for use
   */
  getOrCreateBuffer(
    key: string,
    data: ArrayBufferView,
    usage: GPUBufferUsageFlags,
    options?: {
      label?: string;
      forceUpdate?: boolean; // Skip change detection
      allowGrowth?: boolean; // Allow buffer to grow
      skipChangeDetection?: boolean; // Skip change detection entirely (for data that changes every frame)
      contentVersion?: number; // Content version for fast change detection
    },
  ): GPUBuffer {
    const requiredSize = data.byteLength;
    const existing = this.buffers.get(key);

    // Case 1: Buffer exists and size is sufficient
    if (existing && existing.size >= requiredSize) {
      existing.lastUsedFrame = this.currentFrame;

      // P0-1 Optimization: Skip change detection for data that changes every frame (e.g., States)
      if (options?.skipChangeDetection) {
        this.uploadData(existing.buffer, data, key);
        existing.version++;
        existing.isDirty = false;
        this.stats.totalUpdates++;
        this.stats.totalBytesProcessed += requiredSize;
        return existing.buffer;
      }

      // P0-2 Optimization: Version-based change detection (O(1) instead of O(n))
      if (options?.contentVersion !== undefined) {
        const existingVersion = (existing as any).contentVersion;
        if (!options.forceUpdate && existingVersion === options.contentVersion) {
          // Version matches, data unchanged
          this.stats.bytesSkipped += requiredSize;
          return existing.buffer;
        }
        // Version differs, update data
        (existing as any).contentVersion = options.contentVersion;
        this.uploadData(existing.buffer, data, key);
        this.previousData.set(
          key,
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
        );
        existing.version++;
        existing.isDirty = false;
        this.stats.totalUpdates++;
        this.stats.incrementalUpdates++;
        this.stats.totalBytesProcessed += requiredSize;
        return existing.buffer;
      }

      // Change detection for incremental updates (fallback to element-wise comparison)
      if (!options?.forceUpdate) {
        const hasChanges = this.detectChanges(key, data);
        if (!hasChanges) {
          this.stats.bytesSkipped += requiredSize;
          return existing.buffer;
        }
      }

      // Upload data (full or partial based on change detection)
      this.uploadData(existing.buffer, data, key);
      existing.version++;
      existing.isDirty = false;

      this.stats.totalUpdates++;
      this.stats.totalBytesProcessed += requiredSize;

      return existing.buffer;
    }

    // Case 2: Buffer needs to grow
    if (existing && existing.size < requiredSize) {
      if (options?.allowGrowth !== false) {
        // Destroy old buffer and create larger one
        existing.buffer.destroy();
        this.buffers.delete(key);
      } else {
        throw new Error(
          `Buffer '${key}' size mismatch: has ${existing.size}, needs ${requiredSize}`,
        );
      }
    }

    // Case 3: Create new buffer
    const newSize = this.calculateOptimalSize(requiredSize);
    const buffer = this.device.createBuffer({
      size: newSize,
      usage: usage | GPUBufferUsage.COPY_DST, // Always allow copying
      mappedAtCreation: true,
      label: options?.label || key,
    });

    // Initial data upload
    new Uint8Array(buffer.getMappedRange()).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    buffer.unmap();

    // Store persistent buffer
    const persistentBuffer: PersistentBuffer = {
      buffer,
      size: newSize,
      usage,
      lastUsedFrame: this.currentFrame,
      version: 0,
      isDirty: false,
      label: options?.label,
      contentVersion: options?.contentVersion, // Store initial content version
    };

    this.buffers.set(key, persistentBuffer);
    this.previousData.set(
      key,
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
    );
    this.previousUploadBytes.set(
      key,
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
    );

    this.stats.totalUpdates++;
    this.stats.totalBytesProcessed += requiredSize;

    return buffer;
  }

  getOrCreateEmptyBuffer(
    key: string,
    requiredSize: number,
    usage: GPUBufferUsageFlags,
    options?: {
      label?: string;
      allowGrowth?: boolean;
      contentVersion?: number;
    },
  ): { buffer: GPUBuffer; upToDate: boolean } {
    const existing = this.buffers.get(key);
    if (existing && existing.size >= requiredSize) {
      existing.lastUsedFrame = this.currentFrame;
      const upToDate =
        options?.contentVersion !== undefined &&
        existing.contentVersion === options.contentVersion &&
        !existing.isDirty;
      if (!upToDate) {
        existing.isDirty = true;
      }
      return { buffer: existing.buffer, upToDate };
    }

    if (existing && existing.size < requiredSize) {
      if (options?.allowGrowth !== false) {
        existing.buffer.destroy();
        this.buffers.delete(key);
        this.previousData.delete(key);
        this.previousUploadBytes.delete(key);
      } else {
        throw new Error(
          `Buffer '${key}' size mismatch: has ${existing.size}, needs ${requiredSize}`,
        );
      }
    }

    const newSize = this.calculateOptimalSize(requiredSize);
    const buffer = this.device.createBuffer({
      size: newSize,
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
      label: options?.label || key,
    });

    const persistentBuffer: PersistentBuffer = {
      buffer,
      size: newSize,
      usage,
      lastUsedFrame: this.currentFrame,
      version: 0,
      isDirty: true,
      label: options?.label,
      contentVersion: options?.contentVersion,
    };

    this.buffers.set(key, persistentBuffer);

    return { buffer, upToDate: false };
  }

  markBufferClean(key: string, contentVersion?: number): void {
    const existing = this.buffers.get(key);
    if (!existing) {
      return;
    }
    existing.lastUsedFrame = this.currentFrame;
    existing.isDirty = false;
    if (contentVersion !== undefined) {
      existing.contentVersion = contentVersion;
    }
  }

  uploadIfChanged(
    key: string,
    data: ArrayBufferView,
    usage: GPUBufferUsageFlags,
    options?: {
      label?: string;
      offset?: number;
      size?: number;
      forceUpdate?: boolean;
      allowGrowth?: boolean;
      versionHint?: number;
    },
  ): GPUBuffer {
    const offset = options?.offset ?? 0;
    const size = options?.size ?? data.byteLength;
    const requiredSize = offset + size;
    const existing = this.buffers.get(key);

    if (existing && existing.size >= requiredSize) {
      existing.lastUsedFrame = this.currentFrame;

      const hasVersionHint = options?.versionHint !== undefined;
      const prevContentVersion = existing.contentVersion;
      if (hasVersionHint && !options.forceUpdate && prevContentVersion === options.versionHint) {
        this.stats.bytesSkipped += size;
        return existing.buffer;
      }
      if (hasVersionHint) {
        existing.contentVersion = options.versionHint;
      }

      const bytes = new Uint8Array(data.buffer, data.byteOffset, size);
      const shouldCheckContent =
        !options?.forceUpdate && (!hasVersionHint || prevContentVersion !== options.versionHint);
      if (shouldCheckContent) {
        const prevHash = this.previousDataHash.get(key);
        const prevLength = this.previousDataLength.get(key);
        const nextHash = crc32(bytes);
        if (prevHash !== undefined && prevLength === bytes.byteLength && nextHash === prevHash) {
          this.stats.bytesSkipped += size;
          return existing.buffer;
        }
        this.previousDataHash.set(key, nextHash);
        this.previousDataLength.set(key, bytes.byteLength);
        this.stats.incrementalUpdates++;
      } else if (options?.forceUpdate) {
        const nextHash = crc32(bytes);
        this.previousDataHash.set(key, nextHash);
        this.previousDataLength.set(key, bytes.byteLength);
      }

      const previousBytes = this.previousUploadBytes.get(key);
      const tracker = new DirtyRegionTracker();
      let dirtyBytes = 0;
      if (previousBytes && previousBytes.byteLength === bytes.byteLength) {
        for (let i = 0; i < bytes.byteLength; i++) {
          if (bytes[i] !== previousBytes[i]) {
            tracker.markDirty(i, 1);
          }
        }
        for (const region of tracker.getDirtyRegions()) {
          dirtyBytes += region.length;
        }
      } else {
        tracker.markDirty(0, bytes.byteLength);
        dirtyBytes = bytes.byteLength;
      }

      const dirtyRegions = tracker.getDirtyRegions();
      const shouldUploadAll =
        options?.forceUpdate ||
        dirtyRegions.length === 0 ||
        dirtyBytes / Math.max(size, WRITE_BUFFER_ALIGNMENT) > PARTIAL_UPLOAD_FALLBACK_RATIO;

      if (shouldUploadAll) {
        this.uploadData(existing.buffer, data, key, offset, size);
      } else {
        for (const region of dirtyRegions) {
          this.uploadData(
            existing.buffer,
            data,
            key,
            offset + region.offset,
            region.length,
            region.offset,
          );
        }
      }

      this.previousUploadBytes.set(key, bytes.slice());
      existing.version++;
      existing.isDirty = false;
      this.stats.totalUpdates++;
      this.stats.totalBytesProcessed += shouldUploadAll ? size : dirtyBytes;
      if (!shouldUploadAll) {
        this.stats.bytesSkipped += Math.max(0, size - dirtyBytes);
      }
      return existing.buffer;
    }

    if (existing && existing.size < requiredSize) {
      if (options?.allowGrowth !== false) {
        existing.buffer.destroy();
        this.buffers.delete(key);
        this.previousData.delete(key);
        this.previousUploadBytes.delete(key);
        this.previousDataHash.delete(key);
        this.previousDataLength.delete(key);
      } else {
        throw new Error(
          `Buffer '${key}' size mismatch: has ${existing.size}, needs ${requiredSize}`,
        );
      }
    }

    const newSize = this.calculateOptimalSize(requiredSize);
    const buffer = this.device.createBuffer({
      size: newSize,
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
      label: options?.label || key,
    });

    const mapped = new Uint8Array(buffer.getMappedRange());
    mapped.set(new Uint8Array(data.buffer, data.byteOffset, size), offset);
    buffer.unmap();

    const bytes = new Uint8Array(data.buffer, data.byteOffset, size);
    this.previousDataHash.set(key, crc32(bytes));
    this.previousDataLength.set(key, bytes.byteLength);
    this.previousUploadBytes.set(key, bytes.slice());

    const persistentBuffer: PersistentBuffer = {
      buffer,
      size: newSize,
      usage,
      lastUsedFrame: this.currentFrame,
      version: 0,
      isDirty: false,
      label: options?.label,
      contentVersion: options?.versionHint,
    };

    this.buffers.set(key, persistentBuffer);

    this.stats.totalUpdates++;
    this.stats.totalBytesProcessed += size;

    return buffer;
  }

  /**
   * Update an existing buffer with new data
   *
   * Supports partial updates for efficiency.
   */
  updateBuffer(
    key: string,
    data: ArrayBufferView,
    options?: {
      offset?: number; // Byte offset
      size?: number; // Byte size to update
      forceUpdate?: boolean;
    },
  ): boolean {
    const existing = this.buffers.get(key);
    if (!existing) {
      return false;
    }

    existing.lastUsedFrame = this.currentFrame;

    // Change detection
    if (!options?.forceUpdate) {
      const hasChanges = this.detectChanges(key, data);
      if (!hasChanges) {
        this.stats.bytesSkipped += data.byteLength;
        return true;
      }
    }

    // Upload data
    this.uploadData(existing.buffer, data, key, options?.offset, options?.size);
    existing.version++;
    existing.isDirty = false;

    this.stats.totalUpdates++;
    this.stats.totalBytesProcessed += options?.size || data.byteLength;

    return true;
  }

  /**
   * Detect if data has changed since last upload
   *
   * @returns true if data changed, false if identical
   */
  private detectChanges(key: string, newData: ArrayBufferView): boolean {
    const bytes = new Uint8Array(newData.buffer, newData.byteOffset, newData.byteLength);
    const prevData = this.previousData.get(key);
    if (!prevData || prevData.byteLength !== bytes.byteLength) {
      this.previousData.set(key, bytes.slice());
      this.stats.incrementalUpdates++;
      return true;
    }

    // Fast path: compare buffers
    for (let i = 0; i < bytes.byteLength; i++) {
      if (prevData[i] !== bytes[i]) {
        this.previousData.set(key, bytes.slice());
        this.stats.incrementalUpdates++;
        return true;
      }
    }

    return false;
  }

  /**
   * Upload data to GPU buffer
   */
  private uploadData(
    buffer: GPUBuffer,
    data: ArrayBufferView,
    _key: string,
    offset = 0,
    size?: number,
    dataOffset = 0,
  ): void {
    const uploadSize = size || data.byteLength;
    const sourceByteOffset = data.byteOffset + dataOffset;

    // Use queue.writeBuffer for small updates (more efficient)
    if (uploadSize < 64 * 1024) {
      // < 64KB
      this.device.queue.writeBuffer(buffer, offset, data.buffer, sourceByteOffset, uploadSize);
    } else {
      // For larger updates, use mapped buffer (single allocation)
      const tempBuffer = this.device.createBuffer({
        size: uploadSize,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      });

      new Uint8Array(tempBuffer.getMappedRange()).set(
        new Uint8Array(data.buffer, sourceByteOffset, uploadSize),
      );
      tempBuffer.unmap();

      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(tempBuffer, 0, buffer, offset, uploadSize);
      this.device.queue.submit([encoder.finish()]);

      // Cleanup temp buffer
      setTimeout(() => tempBuffer.destroy(), 16);
    }
  }

  /**
   * Calculate optimal buffer size (with growth headroom)
   *
   * P2-1 Optimization: Tiered alignment strategy to reduce memory waste
   * - Small buffers (<1KB): 64-byte alignment
   * - Medium buffers (1KB-64KB): 256-byte alignment
   * - Large buffers (>=64KB): 4KB alignment (page-aligned)
   */
  private calculateOptimalSize(requiredSize: number): number {
    const withHeadroom = Math.ceil(requiredSize * 1.25);
    const config = bufferAlignmentConfig;
    if (withHeadroom < config.smallThresholdBytes) {
      return Math.ceil(withHeadroom / config.smallAlignmentBytes) * config.smallAlignmentBytes;
    } else if (withHeadroom < config.mediumThresholdBytes) {
      return Math.ceil(withHeadroom / config.mediumAlignmentBytes) * config.mediumAlignmentBytes;
    } else {
      return Math.ceil(withHeadroom / config.largeAlignmentBytes) * config.largeAlignmentBytes;
    }
  }

  /**
   * Check if buffer exists
   */
  hasBuffer(key: string): boolean {
    return this.buffers.has(key);
  }

  /**
   * Get buffer metadata
   */
  getBufferInfo(key: string): PersistentBuffer | undefined {
    return this.buffers.get(key);
  }

  /**
   * Mark buffer for cleanup (will be destroyed if not used)
   */
  markUnused(key: string): void {
    const buffer = this.buffers.get(key);
    if (buffer) {
      buffer.lastUsedFrame = -1;
    }
  }

  /**
   * Advance frame counter and recycle unused buffers
   */
  nextFrame(): void {
    this.currentFrame++;

    const toRemove: string[] = [];
    for (const [key, buffer] of this.buffers.entries()) {
      const framesUnused = this.currentFrame - buffer.lastUsedFrame;
      if (framesUnused > this.recycleThreshold) {
        buffer.buffer.destroy();
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      this.buffers.delete(key);
      this.previousData.delete(key);
      this.previousUploadBytes.delete(key);
      this.previousDataHash.delete(key);
      this.previousDataLength.delete(key);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): IncrementalUpdateStats & {
    activeBuffers: number;
    totalMemoryBytes: number;
    averageBufferSize: number;
    cacheHitRate: number;
    currentMemoryUsage: number;
    peakMemoryUsage: number;
  } {
    let totalMemory = 0;
    for (const buffer of this.buffers.values()) {
      totalMemory += buffer.size;
    }

    if (totalMemory > this.peakMemoryBytes) {
      this.peakMemoryBytes = totalMemory;
    }

    const cacheHitRate =
      this.stats.totalUpdates > 0 ? 1 - this.stats.incrementalUpdates / this.stats.totalUpdates : 0;
    const currentMemoryUsage = totalMemory;
    const peakMemoryUsage = this.peakMemoryBytes;

    return {
      ...this.stats,
      activeBuffers: this.buffers.size,
      totalMemoryBytes: totalMemory,
      averageBufferSize: this.buffers.size > 0 ? totalMemory / this.buffers.size : 0,
      cacheHitRate,
      currentMemoryUsage,
      peakMemoryUsage,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalUpdates: 0,
      incrementalUpdates: 0,
      bytesSkipped: 0,
      totalBytesProcessed: 0,
    };
  }

  /**
   * Force cleanup of all buffers (for testing/disposal)
   */
  dispose(): void {
    for (const buffer of this.buffers.values()) {
      buffer.buffer.destroy();
    }
    this.buffers.clear();
    this.previousData.clear();
    this.previousUploadBytes.clear();
    this.previousDataHash.clear();
    this.previousDataLength.clear();
    this.currentFrame = 0;
  }

  /**
   * Get list of all buffer keys (for debugging)
   */
  getBufferKeys(): string[] {
    return Array.from(this.buffers.keys());
  }

  /**
   * Get total number of managed buffers
   */
  getBufferCount(): number {
    return this.buffers.size;
  }
}

/**
 * Singleton instance for global access
 */
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
