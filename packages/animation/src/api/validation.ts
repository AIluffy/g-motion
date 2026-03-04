import type { InertiaOptions } from '@g-motion/core';
import { createDebugger, panic } from '@g-motion/shared';
import type { StaggerOptions, StaggerValue } from '../types';

const warn = createDebugger('Validation', 'warn');

const SUPPORTED_INTERP = new Set(['linear', 'bezier', 'hold', 'autoBezier', 'spring', 'inertia']);

const DEFAULT_INERTIA_DECEL = 4; // approx half-life 250ms (1000/4)

export interface MarkValidationOptions {
  to?: any;
  duration?: number;
  delay?: number;
  at?: number | ((index: number, entityId: number) => number);
  /**
   * @deprecated 请使用 at
   * @see at
   */
  time?: number | ((index: number, entityId: number) => number);
  interp?: string;
  ease?: string | ((t: number) => number);
  /**
   * @deprecated 请使用 ease
   * @see ease
   */
  easing?: string | ((t: number) => number);
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: any;
  inertia?: InertiaOptions;
  stagger?: StaggerValue;
}

export function validateMarkOptions(options: MarkValidationOptions): void {
  if (options.spring && options.inertia) {
    panic('Invalid mark options: cannot use both spring and inertia', {
      hasSpring: true,
      hasInertia: true,
    });
  }

  if (options.stagger !== undefined) {
    if (typeof options.stagger === 'number') {
      if (options.stagger < 0) {
        panic(`Stagger must be non-negative, got: ${options.stagger}ms`, {
          providedValue: options.stagger,
        });
      }
    } else if (typeof options.stagger === 'function') {
      // valid
    } else if (typeof options.stagger === 'object' && options.stagger !== null) {
      const staggerOptions = options.stagger as StaggerOptions;
      if (!Number.isFinite(staggerOptions.each) || staggerOptions.each < 0) {
        panic(`Stagger options.each must be a non-negative number, got: ${staggerOptions.each}`, {
          providedValue: staggerOptions.each,
        });
      }
      if (staggerOptions.grid !== undefined) {
        const [rows, cols] = staggerOptions.grid;
        if (
          !Number.isFinite(rows) ||
          !Number.isFinite(cols) ||
          rows <= 0 ||
          cols <= 0
        ) {
          panic(`Stagger grid must be [rows, cols] with positive numbers, got: [${rows}, ${cols}]`);
        }
      }
      if (
        staggerOptions.axis !== undefined &&
        staggerOptions.axis !== 'x' &&
        staggerOptions.axis !== 'y'
      ) {
        panic(`Stagger axis must be 'x' or 'y', got: ${String(staggerOptions.axis)}`);
      }
    } else {
      panic(`Stagger must be a number, function, or options object, got: ${typeof options.stagger}`, {
        providedType: typeof options.stagger,
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

  const timeValue = options.at ?? options.time;

  // Validate time
  if (typeof timeValue === 'number') {
    if (timeValue < 0) {
      panic(`Mark at must be non-negative, got: ${timeValue}ms`, {
        providedValue: timeValue,
      });
    }
    // Warn if both absolute time and duration provided (absolute takes precedence)
    if (options.duration !== undefined) {
      warn(`[Motion] Mark has both 'at' (absolute) and 'duration' (relative). Using 'at'.`);
    }
  }

  // Validate time and duration at least one is present (non-physics marks)
  if (!options.spring && !options.inertia && timeValue === undefined && options.duration === undefined) {
    panic(`Mark must have either 'at' (absolute) or 'duration' (relative)`, {
      at: options.at,
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

  const easingValue = options.ease ?? options.easing;

  // Validate easing
  if (easingValue && typeof easingValue !== 'function' && typeof easingValue !== 'string') {
    panic(`Mark easing must be a function or string name, got: ${typeof easingValue}`, {
      providedType: typeof easingValue,
    });
  }

  // Ease alias maps to easing; disallow both
  if (options.ease && options.easing) {
    panic(`Provide either 'ease' or 'easing', not both. Use 'ease' (preferred).`);
  }

  if (options.at !== undefined && options.time !== undefined) {
    panic(`Provide either 'at' or 'time', not both. Use 'at' (preferred).`);
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

  if (process.env.NODE_ENV !== 'production') {
    if ((normalized as MarkValidationOptions).easing !== undefined) {
      console.warn(`[g-motion] 'easing' is deprecated, please use 'ease' instead.`);
    }
    if ((normalized as MarkValidationOptions).time !== undefined) {
      console.warn(`[g-motion] 'time' is deprecated, please use 'at' instead.`);
    }
  }

  if ((normalized as MarkValidationOptions).ease && !(normalized as MarkValidationOptions).easing) {
    (normalized as MarkValidationOptions).easing = (normalized as MarkValidationOptions).ease;
  }

  if ((normalized as MarkValidationOptions).time !== undefined && (normalized as MarkValidationOptions).at === undefined) {
    (normalized as MarkValidationOptions).at = (normalized as MarkValidationOptions).time;
  }

  if ((normalized as MarkValidationOptions).easing && !(normalized as MarkValidationOptions).ease) {
    (normalized as MarkValidationOptions).ease = (normalized as MarkValidationOptions).easing;
  }

  if (normalized.inertia) {
    const inertia = { ...normalized.inertia };
    if (inertia.deceleration === undefined) inertia.deceleration = DEFAULT_INERTIA_DECEL;
    normalized.inertia = inertia;
  }

  return normalized;
}
