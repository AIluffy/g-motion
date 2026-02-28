/**
 * Keyframe Pass Types
 *
 * Type definitions for keyframe GPU compute pass results.
 */

export interface KeyframePreprocessResult {
  packedKeyframesBuffer: GPUBuffer;
  keyframeStartTimesBuffer: GPUBuffer;
  keyframeDurationsBuffer: GPUBuffer;
  rawKeyframeData: Float32Array;
  mapData: Uint32Array;
  entityIndexByEntry: Uint32Array;
  channelIndexByEntry: Uint32Array;
  channelMapsBuffer: GPUBuffer;
  entityIndexByEntryBuffer: GPUBuffer;
  channelIndexByEntryBuffer: GPUBuffer;
  blockStartOffsetsBuffer?: GPUBuffer;
  blockStartTimesBuffer?: GPUBuffer;
}

export interface KeyframeSearchResultGPU {
  searchResultsBuffer: GPUBuffer;
  searchResultsBufferPersistent: boolean;
  outputIndicesData?: Uint32Array;
  outputIndicesBuffer?: GPUBuffer;
  outputIndicesBufferPersistent?: boolean;
  entryCount: number;
}
