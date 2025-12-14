/**
 * GPU Channel Mapping Table
 * Maps GPU output indices to render component property paths.
 * Enables flexible, per-batch property assignment from GPU outputs.
 */

export interface ChannelMapping {
  /** Index in GPU output (0-based, within stride) */
  index: number;
  /** Property path in render.props (e.g., "x", "y", "rotateX") */
  property: string;
  /** Optional: callback to transform value before assignment */
  transform?: (value: number) => number;
}

export interface BatchChannelTable {
  /** Batch/archetype ID */
  batchId: string;
  /** Stride: how many channels per entity */
  stride: number;
  /** Channel mappings */
  channels: ChannelMapping[];
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
    // Initialize with default mapping
    registryInstance.setDefaultChannels(5);
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
