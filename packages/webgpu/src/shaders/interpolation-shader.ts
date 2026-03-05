import { WebGPUConstants } from '@g-motion/shared';
import interpolationShaderCode from './interpolation.wgsl?raw';

// T031: Built-in WGSL Shader for Interpolation
// Extended with Bezier curve support (Phase 1.1)

type CustomGpuEasing = { name: string; wgslFn: string; id: number };

const BASE_INTERPOLATION_SHADER = interpolationShaderCode;

function injectCustomEasings(
  shader: string,
  customEasings: ReadonlyArray<CustomGpuEasing>,
): string {
  if (!customEasings.length) return shader;

  const fnBlob = customEasings
    .map((e) => e.wgslFn.trim())
    .filter(Boolean)
    .join('\n\n');

  const caseBlob = customEasings
    .map((e) => `        case ${e.id}u: { return ${e.name}(t); }`)
    .join('\n');

  return shader
    .replace('// CUSTOM_EASING_FUNCTIONS', fnBlob ? `${fnBlob}\n` : '')
    .replace('// CUSTOM_EASING_SWITCH_CASES', caseBlob);
}

export function buildInterpolationShader(customEasings: ReadonlyArray<CustomGpuEasing>): string {
  return injectCustomEasings(BASE_INTERPOLATION_SHADER, customEasings);
}

export const INTERPOLATION_SHADER = BASE_INTERPOLATION_SHADER;

// Easing mode constants for CPU-side usage
export const EASING_MODE = {
  STANDARD: 0,
  BEZIER: 1,
  HOLD: 2,
} as const;

// Keyframe data layout (10 floats per keyframe)
export const KEYFRAME_STRIDE = WebGPUConstants.BUFFER.STRIDE_KEYFRAME;

/**
 * Pack keyframe data for GPU upload
 * Layout: [startTime, duration, startValue, endValue, easingId, cx1, cy1, cx2, cy2, easingMode]
 */
export function packKeyframeForGPU(
  startTime: number,
  duration: number,
  startValue: number,
  endValue: number,
  easingId: number,
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number },
  easingMode: number = EASING_MODE.STANDARD,
): Float32Array {
  const data = new Float32Array(KEYFRAME_STRIDE);
  data[0] = startTime;
  data[1] = duration;
  data[2] = startValue;
  data[3] = endValue;
  data[4] = easingId;
  data[5] = bezier?.cx1 ?? 0;
  data[6] = bezier?.cy1 ?? 0;
  data[7] = bezier?.cx2 ?? 1;
  data[8] = bezier?.cy2 ?? 1;
  data[9] = easingMode;
  return data;
}
