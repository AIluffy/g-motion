import { MotionError, ErrorCode, ErrorSeverity } from '../errors';
import { OUTPUT_FORMAT } from './output-format-shader';

const STANDARD_TRANSFORM_PROPERTIES = ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'opacity'] as const;
const MATRIX2D_SENTINEL_PREFIX = '__matrix2d';
const MATRIX3D_SENTINEL_PREFIX = '__matrix3d';

/**
 * GPU Channel Mapping Table
 * Maps GPU output indices to render component property paths.
 * Enables flexible, per-batch property assignment from GPU outputs.
 */

export interface ChannelMapping {
  index: number;
  property: string;
  sourceIndex?: number;
  packedProps?: [string, string];
  transform?: (value: number) => number;
  unpackAndAssign?: (value: number, context: any) => void;
  formatType?: number;
  minValue?: number;
  maxValue?: number;
}

export type BatchChannelKind = 'primitive' | 'standardTransform' | 'custom';

export interface BatchChannelTable {
  /** Batch/archetype ID */
  batchId: string;
  /** Raw stride: how many channels per entity produced by interpolation pass */
  rawStride?: number;
  /** Raw channel order used for sampling and interpolation */
  rawChannels?: ChannelMapping[];
  /** Stride: how many channels per entity */
  stride: number;
  /** Channel mappings */
  channels: ChannelMapping[];
  kind?: BatchChannelKind;
}

/**
 * GPU Channel Mapping Registry
 * Manages per-batch channel configurations for result delivery.
 */
export class GPUChannelMappingRegistry {
  private tables = new Map<string, BatchChannelTable>();
  private defaultTable: BatchChannelTable | null = null;

  /**
   * Register a channel mapping table for a batch
   */
  registerBatchChannels(table: BatchChannelTable): void {
    if (!Number.isFinite(table.stride) || table.stride <= 0) {
      throw new MotionError(
        'GPU channel table stride must be a positive integer.',
        ErrorCode.BATCH_VALIDATION_FAILED,
        ErrorSeverity.FATAL,
        { batchId: table.batchId, stride: table.stride },
      );
    }

    if (!Array.isArray(table.channels) || table.channels.length === 0) {
      throw new MotionError(
        'GPU channel table must define at least one channel.',
        ErrorCode.BATCH_VALIDATION_FAILED,
        ErrorSeverity.FATAL,
        { batchId: table.batchId },
      );
    }

    const firstChannel = table.channels[0];
    const isPrimitiveTable =
      table.channels.length === 1 && firstChannel && firstChannel.property === '__primitive';

    if (isPrimitiveTable && table.stride !== 1) {
      throw new MotionError(
        'Primitive GPU channel table must use stride=1 for __primitive output.',
        ErrorCode.BATCH_VALIDATION_FAILED,
        ErrorSeverity.FATAL,
        { batchId: table.batchId, stride: table.stride },
      );
    }

    const rawChannels = table.rawChannels ?? table.channels;
    if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
      throw new MotionError(
        'GPU channel table must define at least one raw channel.',
        ErrorCode.BATCH_VALIDATION_FAILED,
        ErrorSeverity.FATAL,
        { batchId: table.batchId },
      );
    }
    if (table.rawStride !== undefined) {
      if (!Number.isFinite(table.rawStride) || table.rawStride <= 0) {
        throw new MotionError(
          'GPU channel table rawStride must be a positive integer.',
          ErrorCode.BATCH_VALIDATION_FAILED,
          ErrorSeverity.FATAL,
          { batchId: table.batchId, rawStride: table.rawStride },
        );
      }
      if (table.rawStride !== rawChannels.length) {
        throw new MotionError(
          'GPU channel table rawStride must match rawChannels.length.',
          ErrorCode.BATCH_VALIDATION_FAILED,
          ErrorSeverity.FATAL,
          { batchId: table.batchId, rawStride: table.rawStride, rawChannels: rawChannels.length },
        );
      }
    }

    if (isStandardTransformChannels(table.channels)) {
      table.kind = 'standardTransform';
    } else if (isPrimitiveTable) {
      table.kind = 'primitive';
    } else if (!table.kind) {
      table.kind = 'custom';
    }

    this.tables.set(table.batchId, table);
  }

  /**
   * Set the default channel table for unknown batches
   * Default maps [x, y, rotateX, rotateY, translateZ]
   */
  setDefaultChannels(stride: number, channels?: ChannelMapping[]): void {
    const defaultChannels: ChannelMapping[] = channels ?? [
      { index: 0, property: 'x' },
      { index: 1, property: 'y' },
      { index: 2, property: 'rotateX' },
      { index: 3, property: 'rotateY' },
      { index: 4, property: 'translateZ' },
    ];

    this.defaultTable = {
      batchId: '__default__',
      stride,
      channels: defaultChannels,
      kind: 'custom',
    };
  }

  /**
   * Get channel mapping for a batch
   */
  getChannels(batchId: string): BatchChannelTable | null {
    return this.tables.get(batchId) ?? this.defaultTable;
  }

  /**
   * Get all registered batch tables
   */
  getAllTables(): BatchChannelTable[] {
    return Array.from(this.tables.values());
  }

  /**
   * Clear all registered tables
   */
  clear(): void {
    this.tables.clear();
    this.defaultTable = null;
  }

  /**
   * Get stats for monitoring
   */
  getStats(): {
    registeredBatches: number;
    hasDefault: boolean;
    totalMappings: number;
  } {
    let totalMappings = 0;
    for (const table of this.tables.values()) {
      totalMappings += table.channels.length;
    }
    if (this.defaultTable) {
      totalMappings += this.defaultTable.channels.length;
    }
    return {
      registeredBatches: this.tables.size,
      hasDefault: this.defaultTable !== null,
      totalMappings,
    };
  }
}

/**
 * Global singleton instance
 */
let registryInstance: GPUChannelMappingRegistry | null = null;

export function getGPUChannelMappingRegistry(): GPUChannelMappingRegistry {
  if (!registryInstance) {
    registryInstance = new GPUChannelMappingRegistry();
  }
  return registryInstance;
}

/**
 * Helper to create a channel mapping quickly
 */
export function createChannelMapping(
  index: number,
  property: string,
  transform?: (v: number) => number,
): ChannelMapping {
  return { index, property, transform };
}

/**
 * Helper to create a batch channel table
 */
export function createBatchChannelTable(
  batchId: string,
  stride: number,
  properties: string[],
): BatchChannelTable {
  return {
    batchId,
    stride,
    channels: properties.map((prop, idx) => ({
      index: idx,
      property: prop,
    })),
  };
}

export function createPackedRGBAChannelTable(
  batchId: string,
  rgbaChannels: [string, string, string, string],
  outputProperty: string,
): BatchChannelTable {
  const rawChannels: ChannelMapping[] = rgbaChannels.map((property, index) => ({
    index,
    property,
  }));

  const channels: ChannelMapping[] = [
    {
      index: 0,
      property: outputProperty,
      sourceIndex: 0,
      formatType: OUTPUT_FORMAT.COLOR_RGBA,
      minValue: 0,
      maxValue: 1,
    },
  ];

  return {
    batchId,
    rawStride: rawChannels.length,
    rawChannels,
    stride: channels.length,
    channels,
    kind: 'custom',
  };
}

export function createMatrix2DTransformChannelTable(batchId: string): BatchChannelTable {
  const rawChannels: ChannelMapping[] = new Array(6);
  const channels: ChannelMapping[] = new Array(6);
  for (let i = 0; i < 6; i++) {
    const property = `${MATRIX2D_SENTINEL_PREFIX}${i}`;
    rawChannels[i] = { index: i, property };
    channels[i] = { index: i, property, formatType: OUTPUT_FORMAT.MATRIX_2D };
  }

  return {
    batchId,
    rawStride: rawChannels.length,
    rawChannels,
    stride: channels.length,
    channels,
    kind: 'custom',
  };
}

export function createMatrix3DTransformChannelTable(batchId: string): BatchChannelTable {
  const rawChannels: ChannelMapping[] = new Array(16);
  const channels: ChannelMapping[] = new Array(16);
  for (let i = 0; i < 16; i++) {
    const property = `${MATRIX3D_SENTINEL_PREFIX}${i}`;
    rawChannels[i] = { index: i, property };
    channels[i] = { index: i, property, formatType: OUTPUT_FORMAT.MATRIX_3D };
  }

  return {
    batchId,
    rawStride: rawChannels.length,
    rawChannels,
    stride: channels.length,
    channels,
    kind: 'custom',
  };
}

export function isStandardTransformChannels(channels: ChannelMapping[]): boolean {
  if (channels.length !== STANDARD_TRANSFORM_PROPERTIES.length) {
    return false;
  }
  for (let i = 0; i < STANDARD_TRANSFORM_PROPERTIES.length; i++) {
    const expected = STANDARD_TRANSFORM_PROPERTIES[i];
    const ch = channels[i];
    if (!ch || ch.property !== expected || ch.index !== i) {
      return false;
    }
  }
  return true;
}

export function isMatrix2DTransformChannels(channels: ChannelMapping[]): boolean {
  if (channels.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    const ch = channels[i];
    if (!ch || ch.index !== i) return false;
    if (ch.formatType !== OUTPUT_FORMAT.MATRIX_2D) return false;
    if (ch.property !== `${MATRIX2D_SENTINEL_PREFIX}${i}`) return false;
  }
  return true;
}

export function isMatrix3DTransformChannels(channels: ChannelMapping[]): boolean {
  if (channels.length !== 16) return false;
  for (let i = 0; i < 16; i++) {
    const ch = channels[i];
    if (!ch || ch.index !== i) return false;
    if (ch.formatType !== OUTPUT_FORMAT.MATRIX_3D) return false;
    if (ch.property !== `${MATRIX3D_SENTINEL_PREFIX}${i}`) return false;
  }
  return true;
}
