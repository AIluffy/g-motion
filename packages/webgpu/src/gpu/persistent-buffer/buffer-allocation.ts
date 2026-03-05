import type { BufferAlignmentConfig } from './types';

export function calculateOptimalBufferSize(
  requiredSize: number,
  config: BufferAlignmentConfig,
): number {
  const withHeadroom = Math.ceil(requiredSize * 1.25);
  if (withHeadroom < config.smallThresholdBytes) {
    return Math.ceil(withHeadroom / config.smallAlignmentBytes) * config.smallAlignmentBytes;
  }
  if (withHeadroom < config.mediumThresholdBytes) {
    return Math.ceil(withHeadroom / config.mediumAlignmentBytes) * config.mediumAlignmentBytes;
  }
  return Math.ceil(withHeadroom / config.largeAlignmentBytes) * config.largeAlignmentBytes;
}
