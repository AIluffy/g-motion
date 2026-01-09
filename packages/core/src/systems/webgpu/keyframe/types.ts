/**
 * Keyframe Pass Types
 *
 * Type definitions for keyframe GPU compute pass results.
 */

export interface KeyframePreprocessResult {
  packedKeyframesBuffer: GPUBuffer;
  rawKeyframeData: Float32Array;
  mapData: Uint32Array;
  entityIndexByEntry: Uint32Array;
  channelIndexByEntry: Uint32Array;
}

export interface KeyframeSearchResultGPU {
  searchResultsBuffer: GPUBuffer;
  outputIndicesData: Uint32Array;
  entryCount: number;
}
