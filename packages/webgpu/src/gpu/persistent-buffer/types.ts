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
  version: number;
  isDirty: boolean;
  label?: string;
  contentVersion?: number;
}

export interface BufferUpdateDescriptor {
  data: ArrayBufferView;
  offset?: number;
  size?: number;
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

export const WRITE_BUFFER_ALIGNMENT = 4;
export const PARTIAL_UPLOAD_FALLBACK_RATIO = 0.35;

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
