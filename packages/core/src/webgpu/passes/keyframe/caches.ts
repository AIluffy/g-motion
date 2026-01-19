export type KeyframePreprocessCPUCacheEntry = {
  keyframesVersion: number;
  rawData: Float32Array;
  mapData: Uint32Array;
  entityIndexByEntry: Uint32Array;
  channelIndexByEntry: Uint32Array;
};

export const s_keyframePreprocessCPUCache = new Map<string, KeyframePreprocessCPUCacheEntry>();

export function __resetKeyframePreprocessCPUCacheForTests(): void {
  s_keyframePreprocessCPUCache.clear();
}
