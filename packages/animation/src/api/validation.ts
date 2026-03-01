import type { InertiaOptions } from '@g-motion/core';
import { createDebugger, panic } from '@g-motion/shared';

const warn = createDebugger('Validation', 'warn');

const SUPPORTED_INTERP = new Set(['linear', 'bezier', 'hold', 'autoBezier', 'spring', 'inertia']);

const DEFAULT_INERTIA_DECEL = 4; // approx half-life 250ms (1000/4)

export interface MarkValidationOptions {
  to?: any;
  duration?: number;
  delay?: number;
  time?: number | ((index: number, entityId: number) => number);
  interp?: string;
  ease?: string | ((t: number) => number);
  easing?: string | ((t: number) => number);
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: any;
  inertia?: InertiaOptions;
  stagger?: number | ((index: number) => number);
}

export function validateMarkOptions(options: MarkValidationOptions): void {
  if (options.spring && options.inertia) {
    panic('Invalid mark options: cannot use both spring and inertia', {
      hasSpring: true,
      hasInertia: true,
    });
  }

  if (options.stagger !== undefined) {
    if (typeof options.stagger !== 'number' && typeof options.stagger !== 'function') {
      panic(`Stagger must be a number or function, got: ${typeof options.stagger}`, {
        providedType: typeof options.stagger,
      });
    }
    if (typeof options.stagger === 'number' && options.stagger < 0) {
      panic(`Stagger must be non-negative, got: ${options.stagger}ms`, {
        providedValue: options.stagger,
      });
    }
  }

  // Validate duration
  if (options.duration !== undefined) {
    if (typeof options.duration !== 'number') {
      panic(`Mark duration must be a number, got: ${typeof options.duration}`, {
        providedType: typeof options.duration,
      });
    }
    if (options.duration < 0) {
      panic(`Mark duration must be non-negative, got: ${options.duration}ms`, {
        providedValue: options.duration,
      });
    }
  }

  // Validate time
  if (typeof options.time === 'number') {
    if (options.time < 0) {
      panic(`Mark time must be non-negative, got: ${options.time}ms`, {
        providedValue: options.time,
      });
    }
    // Warn if both time and duration provided (time takes precedence)
    if (options.duration !== undefined) {
      warn(
        `[Motion] Mark has both 'time' (absolute) and 'duration' (relative). Using 'time', ignoring 'duration'.`,
      );
    }
  }

  // Validate time and duration at least one is present (non-physics marks)
  if (
    !options.spring &&
    !options.inertia &&
    options.time === undefined &&
    options.duration === undefined
  ) {
    panic(`Mark must have either 'time' (absolute) or 'duration' (relative)`, {
      time: options.time,
      duration: options.duration,
    });
  }

  // Validate interp
  if (options.interp && !SUPPORTED_INTERP.has(options.interp)) {
    panic(
      `Unsupported interp value: '${options.interp}'. Supported: ${Array.from(SUPPORTED_INTERP).join(', ')}`,
      { providedInterp: options.interp, supported: Array.from(SUPPORTED_INTERP) },
    );
  }

  // Validate easing
  if (
    options.easing &&
    typeof options.easing !== 'function' &&
    typeof options.easing !== 'string'
  ) {
    panic(`Mark easing must be a function or string name, got: ${typeof options.easing}`, {
      providedType: typeof options.easing,
    });
  }

  // Ease alias maps to easing; disallow both
  if (options.ease && options.easing) {
    panic(`Provide either 'ease' or 'easing', not both. Use 'easing' (preferred).`);
  }

  // Validate bezier control points
  if (options.bezier) {
    const { cx1, cy1, cx2, cy2 } = options.bezier;
    if (
      typeof cx1 !== 'number' ||
      typeof cy1 !== 'number' ||
      typeof cx2 !== 'number' ||
      typeof cy2 !== 'number'
    ) {
      panic(
        `Bezier control points must be numbers, got: { cx1: ${typeof cx1}, cy1: ${typeof cy1}, cx2: ${typeof cx2}, cy2: ${typeof cy2} }`,
        {
          cx1Types: typeof cx1,
          cy1Types: typeof cy1,
          cx2Types: typeof cx2,
          cy2Types: typeof cy2,
        },
      );
    }
    if (cx1 < 0 || cx1 > 1 || cx2 < 0 || cx2 > 1) {
      panic(`Bezier cx1 and cx2 must be in range [0,1], got: { cx1: ${cx1}, cx2: ${cx2} }`, {
        cx1,
        cx2,
      });
    }
  }
}

export function normalizeMarkOptions<T extends MarkValidationOptions>(options: T): T {
  const normalized = { ...options } as T;
  if ((normalized as any).ease && !(normalized as any).easing) {
    (normalized as any).easing = (normalized as any).ease;
  }

  if (normalized.inertia) {
    const inertia = { ...normalized.inertia };
    if (inertia.deceleration === undefined) inertia.deceleration = DEFAULT_INERTIA_DECEL;
    normalized.inertia = inertia;
  }

  return normalized;
}
