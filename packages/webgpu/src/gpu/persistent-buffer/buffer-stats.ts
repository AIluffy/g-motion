import type { PersistentBuffer, IncrementalUpdateStats } from './types';

export interface PersistentBufferManagerStats extends IncrementalUpdateStats {
  activeBuffers: number;
  totalMemoryBytes: number;
  averageBufferSize: number;
  cacheHitRate: number;
  currentMemoryUsage: number;
  peakMemoryUsage: number;
}

export function createInitialStats(): IncrementalUpdateStats {
  return {
    totalUpdates: 0,
    incrementalUpdates: 0,
    bytesSkipped: 0,
    totalBytesProcessed: 0,
  };
}

export function createStatsSnapshot(
  buffers: Map<string, PersistentBuffer>,
  stats: IncrementalUpdateStats,
  peakMemoryBytes: number,
): {
  snapshot: PersistentBufferManagerStats;
  peakMemoryBytes: number;
} {
  let totalMemory = 0;
  for (const buffer of buffers.values()) {
    totalMemory += buffer.size;
  }

  const nextPeak = Math.max(peakMemoryBytes, totalMemory);
  const cacheHitRate =
    stats.totalUpdates > 0 ? 1 - stats.incrementalUpdates / stats.totalUpdates : 0;

  return {
    snapshot: {
      ...stats,
      activeBuffers: buffers.size,
      totalMemoryBytes: totalMemory,
      averageBufferSize: buffers.size > 0 ? totalMemory / buffers.size : 0,
      cacheHitRate,
      currentMemoryUsage: totalMemory,
      peakMemoryUsage: nextPeak,
    },
    peakMemoryBytes: nextPeak,
  };
}
