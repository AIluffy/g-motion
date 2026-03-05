import { getGPUBridge } from './gpu-registry';

export interface CoreGPUModule {
  getPendingReadbackCount?(): number;
  getGPUResultQueueLength?(): number;
  setGPUResultWakeup?(wakeup?: () => void): void;
  setForcedWorkgroupSize?(size: number | null): void;
  consumeForcedGPUStateSyncEntityIdsSet?(): Set<number>;
  isPhysicsGPUEntity?(entityId: number): boolean;
  selectWorkgroupSize?(archetypeId: string, entityCount: number): number;
  getGPUChannelMappingRegistry(): {
    getChannels(archetypeId: string): {
      channels?: Array<{ index: number; property: string }>;
      rawChannels?: Array<{ index: number; property: string }>;
      stride?: number;
      rawStride?: number;
    } | null;
  };
  preprocessChannelsToRawAndMap(
    channels: Array<{
      property: string;
      track: Array<{
        startTime: number;
        time: number;
        startValue: number;
        endValue: number;
        easing: unknown;
      }>;
    }>,
    options: { timeInterval: number; maxSubdivisionsPerSegment?: number },
    evaluateRawValue: (
      keyframe: {
        startTime: number;
        time: number;
        startValue: number;
        endValue: number;
        easing: unknown;
      },
      t: number,
    ) => number,
  ): {
    rawKeyframes: Float32Array[];
    channelMaps: Uint32Array[];
  };
  packRawKeyframes(rawKeyframes: Float32Array[]): Float32Array;
  packChannelMaps(channelMaps: Uint32Array[]): Uint32Array;
  getPersistentGPUBufferManager(device?: unknown): {
    getStats(): {
      bytesSkipped?: number;
      totalBytesProcessed?: number;
      currentMemoryUsage?: number;
      peakMemoryUsage?: number;
      totalMemoryBytes?: number;
    };
  };
}

export const PHYSICS_STATE_STRIDE = 16;

export function getGPUModuleSync(): CoreGPUModule | null {
  return (getGPUBridge() as CoreGPUModule | null) ?? null;
}
