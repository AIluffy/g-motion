import { crc32 } from '../../stream/crc32';
import { calculateOptimalBufferSize } from './buffer-allocation';
import {
  destroyTrackedBuffer,
  disposeAllBuffers,
  recycleUnusedBuffers,
  type BufferStateStore,
} from './buffer-lifecycle';
import {
  createInitialStats,
  createStatsSnapshot,
  type PersistentBufferManagerStats,
} from './buffer-stats';
import {
  DirtyRegionTracker,
  getBufferAlignmentConfig,
  PARTIAL_UPLOAD_FALLBACK_RATIO,
  WRITE_BUFFER_ALIGNMENT,
  type IncrementalUpdateStats,
  type PersistentBuffer,
} from './types';

export class PersistentGPUBufferManager {
  private device: GPUDevice;
  private buffers = new Map<string, PersistentBuffer>();
  private previousData = new Map<string, Uint8Array>();
  private previousUploadBytes = new Map<string, Uint8Array>();
  private previousDataHash = new Map<string, number>();
  private previousDataLength = new Map<string, number>();
  private currentFrame = 0;
  private readonly recycleThreshold = 120;
  private stats: IncrementalUpdateStats = createInitialStats();
  private peakMemoryBytes = 0;

  constructor(device: GPUDevice) {
    this.device = device;
  }
  getOrCreateBuffer(
    key: string,
    data: ArrayBufferView,
    usage: GPUBufferUsageFlags,
    options?: {
      label?: string;
      forceUpdate?: boolean;
      allowGrowth?: boolean;
      skipChangeDetection?: boolean;
      contentVersion?: number;
    },
  ): GPUBuffer {
    const requiredSize = data.byteLength;
    const existing = this.buffers.get(key);

    if (existing && existing.size >= requiredSize) {
      existing.lastUsedFrame = this.currentFrame;

      if (options?.skipChangeDetection) {
        this.uploadData(existing.buffer, data, key);
        existing.version++;
        existing.isDirty = false;
        this.stats.totalUpdates++;
        this.stats.totalBytesProcessed += requiredSize;
        return existing.buffer;
      }

      if (options?.contentVersion !== undefined) {
        const existingVersion = existing.contentVersion;
        if (!options.forceUpdate && existingVersion === options.contentVersion) {
          this.stats.bytesSkipped += requiredSize;
          return existing.buffer;
        }
        existing.contentVersion = options.contentVersion;
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

      if (!options?.forceUpdate) {
        const hasChanges = this.detectChanges(key, data);
        if (!hasChanges) {
          this.stats.bytesSkipped += requiredSize;
          return existing.buffer;
        }
      }

      this.uploadData(existing.buffer, data, key);
      existing.version++;
      existing.isDirty = false;
      this.stats.totalUpdates++;
      this.stats.totalBytesProcessed += requiredSize;
      return existing.buffer;
    }

    if (existing && existing.size < requiredSize) {
      if (options?.allowGrowth !== false) {
        destroyTrackedBuffer(this.stateStore(), key);
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

    new Uint8Array(buffer.getMappedRange()).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    buffer.unmap();

    const persistentBuffer: PersistentBuffer = {
      buffer,
      size: newSize,
      usage,
      lastUsedFrame: this.currentFrame,
      version: 0,
      isDirty: false,
      label: options?.label,
      contentVersion: options?.contentVersion,
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
        destroyTrackedBuffer(this.stateStore(), key);
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
        destroyTrackedBuffer(this.stateStore(), key);
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
  updateBuffer(
    key: string,
    data: ArrayBufferView,
    options?: {
      offset?: number;
      size?: number;
      forceUpdate?: boolean;
    },
  ): boolean {
    const existing = this.buffers.get(key);
    if (!existing) {
      return false;
    }

    existing.lastUsedFrame = this.currentFrame;
    if (!options?.forceUpdate) {
      const hasChanges = this.detectChanges(key, data);
      if (!hasChanges) {
        this.stats.bytesSkipped += data.byteLength;
        return true;
      }
    }

    this.uploadData(existing.buffer, data, key, options?.offset, options?.size);
    existing.version++;
    existing.isDirty = false;
    this.stats.totalUpdates++;
    this.stats.totalBytesProcessed += options?.size || data.byteLength;
    return true;
  }
  hasBuffer(key: string): boolean {
    return this.buffers.has(key);
  }

  getBufferInfo(key: string): PersistentBuffer | undefined {
    return this.buffers.get(key);
  }
  markUnused(key: string): void {
    const buffer = this.buffers.get(key);
    if (buffer) {
      buffer.lastUsedFrame = -1;
    }
  }
  nextFrame(): void {
    this.currentFrame++;
    recycleUnusedBuffers(this.stateStore(), this.currentFrame, this.recycleThreshold);
  }
  getStats(): PersistentBufferManagerStats {
    const { snapshot, peakMemoryBytes } = createStatsSnapshot(
      this.buffers,
      this.stats,
      this.peakMemoryBytes,
    );
    this.peakMemoryBytes = peakMemoryBytes;
    return snapshot;
  }
  resetStats(): void {
    this.stats = createInitialStats();
  }

  dispose(): void {
    disposeAllBuffers(this.stateStore());
    this.currentFrame = 0;
  }
  getBufferKeys(): string[] {
    return Array.from(this.buffers.keys());
  }

  getBufferCount(): number {
    return this.buffers.size;
  }
  private detectChanges(key: string, newData: ArrayBufferView): boolean {
    const bytes = new Uint8Array(newData.buffer, newData.byteOffset, newData.byteLength);
    const prevData = this.previousData.get(key);
    if (!prevData || prevData.byteLength !== bytes.byteLength) {
      this.previousData.set(key, bytes.slice());
      this.stats.incrementalUpdates++;
      return true;
    }

    for (let i = 0; i < bytes.byteLength; i++) {
      if (prevData[i] !== bytes[i]) {
        this.previousData.set(key, bytes.slice());
        this.stats.incrementalUpdates++;
        return true;
      }
    }

    return false;
  }
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

    if (uploadSize < 64 * 1024) {
      this.device.queue.writeBuffer(buffer, offset, data.buffer, sourceByteOffset, uploadSize);
    } else {
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
      setTimeout(() => tempBuffer.destroy(), 16);
    }
  }
  private calculateOptimalSize(requiredSize: number): number {
    return calculateOptimalBufferSize(requiredSize, getBufferAlignmentConfig());
  }
  private stateStore(): BufferStateStore {
    return {
      buffers: this.buffers,
      previousData: this.previousData,
      previousUploadBytes: this.previousUploadBytes,
      previousDataHash: this.previousDataHash,
      previousDataLength: this.previousDataLength,
    };
  }
}
