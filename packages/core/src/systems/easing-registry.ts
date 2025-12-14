import { getCustomGpuEasings, registerCustomGpuEasing } from '../webgpu/custom-easing';
/**
 * Easing function registry and ID system for GPU compute.
 * Each easing function is assigned a unique ID (0-30) for use in shaders.
 */

export const EASING_IDS = {
  easeLinear: 0,
  easeInQuad: 1,
  easeOutQuad: 2,
  easeInOutQuad: 3,
  easeInCubic: 4,
  easeOutCubic: 5,
  easeInOutCubic: 6,
  easeInQuart: 7,
  easeOutQuart: 8,
  easeInOutQuart: 9,
  easeInQuint: 10,
  easeOutQuint: 11,
  easeInOutQuint: 12,
  easeInSine: 13,
  easeOutSine: 14,
  easeInOutSine: 15,
  easeInExpo: 16,
  easeOutExpo: 17,
  easeInOutExpo: 18,
  easeInCirc: 19,
  easeOutCirc: 20,
  easeInOutCirc: 21,
  easeInBack: 22,
  easeOutBack: 23,
  easeInOutBack: 24,
  easeInElastic: 25,
  easeOutElastic: 26,
  easeInOutElastic: 27,
  easeInBounce: 28,
  easeOutBounce: 29,
  easeInOutBounce: 30,
} as const;

// Custom GPU easings are assigned IDs starting at 31 via registerCustomGpuEasing.

/**
 * Standard easing function implementations.
 * These are used as reference implementations and for CPU-based easing.
 * Exported for string-to-function conversion.
 */
export const EASING_FUNCTIONS: Record<string, (t: number) => number> = {
  easeLinear: (t) => t,
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeIn: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  easeInOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeInCirc: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  easeInOutCirc: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  easeInBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  easeInElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInOutElastic: (t) => {
    const c5 = (2 * Math.PI) / 4.5;
    return t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },
  easeInBounce: (t) => 1 - easeOutBounceImpl(1 - t),
  easeOutBounce: easeOutBounceImpl,
  easeInOutBounce: (t) =>
    t < 0.5 ? (1 - easeOutBounceImpl(1 - 2 * t)) / 2 : (1 + easeOutBounceImpl(2 * t - 1)) / 2,
};

function easeOutBounceImpl(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
}

/**
 * Resolve easing to a function (converts string names to functions)
 * @param easing - String name or function
 * @returns Easing function implementation
 */
export function resolveEasing(easing?: string | ((t: number) => number)): (t: number) => number {
  if (!easing) return EASING_FUNCTIONS.easeLinear;

  // If already a function, return as-is
  if (typeof easing === 'function') return easing;

  // If string, look up in registry
  if (typeof easing === 'string') {
    return EASING_FUNCTIONS[easing] || EASING_FUNCTIONS.easeLinear;
  }

  return EASING_FUNCTIONS.easeLinear;
}

/**
 * Get the easing ID for a given easing (string name or function).
 * Attempts to match the function by name using toString() introspection.
 *
 * @param easing - Easing string name or function to look up
 * @returns Easing ID (0-30) or 0 (easeLinear) if not found
 */
export function getEasingId(easing?: string | ((t: number) => number)): number {
  if (!easing) return EASING_IDS.easeLinear;

  // If string, map simplified names to internal IDs
  if (typeof easing === 'string') {
    // Map simplified names to internal EASING_IDS keys
    const nameMap: Record<string, keyof typeof EASING_IDS> = {
      linear: 'easeLinear',
      easeIn: 'easeInQuad',
      easeOut: 'easeOutQuad',
      easeInOut: 'easeInOutQuad',
    };

    const internalName = nameMap[easing] || (easing as keyof typeof EASING_IDS);
    return EASING_IDS[internalName] ?? EASING_IDS.easeLinear;
  }

  // Try to extract function name from the function
  const funcName = easing.name;
  if (funcName && funcName in EASING_IDS) {
    return EASING_IDS[funcName as keyof typeof EASING_IDS];
  }

  // Check custom GPU easings registered with matching name
  if (funcName) {
    const custom = getCustomGpuEasings().find((e) => e.name === funcName);
    if (custom) return custom.id;
  }

  // Fallback to linear if function not found
  return EASING_IDS.easeLinear;
}

/**
 * Check if an easing function is supported on the GPU.
 * All easing functions from EASING_IDS are supported.
 *
 * @param easing - Easing function to check
 * @returns true if the easing can be computed on GPU, false otherwise
 */
export function isEasingGPUSupported(easing?: (t: number) => number): boolean {
  if (!easing) return true; // Linear is always supported

  const funcName = easing.name;
  if (!funcName) return false;
  if (funcName in EASING_IDS) return true;
  return getCustomGpuEasings().some((e) => e.name === funcName);
}

/**
 * Get the CPU implementation of an easing function by ID.
 * Used as fallback when GPU compute is not available.
 *
 * @param easingId - Easing ID (0-30)
 * @returns Easing function implementation
 */
export function getEasingFunctionById(easingId: number): (t: number) => number {
  const entry = Object.entries(EASING_IDS).find(([, id]) => id === easingId);
  if (entry) {
    const funcName = entry[0];
    return EASING_FUNCTIONS[funcName] || EASING_FUNCTIONS.easeLinear;
  }

  const custom = getCustomGpuEasings().find((e) => e.id === easingId);
  if (custom) {
    // Custom easings registered for GPU do not have CPU impl here; default to linear.
    return EASING_FUNCTIONS.easeLinear;
  }
  return EASING_FUNCTIONS.easeLinear;
}

/**
 * Register a custom easing for GPU by providing both the JS easing (for CPU) and WGSL body.
 * The easing function name must match the WGSL function name.
 */
export function registerEasingWithWGSL(
  name: string,
  fn: (t: number) => number,
  wgslFn: string,
): void {
  // Register CPU easing under the given name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (EASING_FUNCTIONS as any)[name] = fn;
  // Allocate a GPU ID and store WGSL for shader generation
  registerCustomGpuEasing(name, wgslFn);
}
