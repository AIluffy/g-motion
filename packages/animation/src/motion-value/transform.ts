import { clamp01, lerp } from '@g-motion/shared';

import type { MotionValue, MotionValueRangeConfig, TransformFunction } from './types';
import { value } from './value';

function isRangeConfig(
  input: MotionValueRangeConfig | TransformFunction,
): input is MotionValueRangeConfig {
  return typeof input === 'object';
}

function mapRange(source: number, config: MotionValueRangeConfig): number {
  const [inputStart, inputEnd] = config.input;
  const [outputStart, outputEnd] = config.output;

  if (inputStart === inputEnd) {
    return outputEnd;
  }

  const progress = clamp01((source - inputStart) / (inputEnd - inputStart));
  return lerp(outputStart, outputEnd, progress);
}

export function transform(source: MotionValue, map: TransformFunction): MotionValue;
export function transform(source: MotionValue, map: MotionValueRangeConfig): MotionValue;
export function transform(
  sources: MotionValue[],
  map: (...values: number[]) => number,
): MotionValue;
export function transform(
  sourceOrSources: MotionValue | MotionValue[],
  map: TransformFunction | MotionValueRangeConfig | ((...values: number[]) => number),
): MotionValue {
  const sources = Array.isArray(sourceOrSources) ? sourceOrSources : [sourceOrSources];
  const compute = () => {
    const latest = sources.map((source) => source.get());

    if (Array.isArray(sourceOrSources)) {
      return (map as (...values: number[]) => number)(...latest);
    }

    if (isRangeConfig(map as MotionValueRangeConfig | TransformFunction)) {
      return mapRange(latest[0] ?? 0, map as MotionValueRangeConfig);
    }

    return (map as TransformFunction)(latest[0] ?? 0);
  };

  const derived = value(compute());
  for (const source of sources) {
    source.onChange(() => {
      derived.set(compute());
    });
  }

  return derived;
}
