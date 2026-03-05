import type { InertiaParams } from '@g-motion/core';
import { createDebugger, panic } from '@g-motion/shared';
import type { StaggerOptions, StaggerValue } from '../types/targets';

const warn = createDebugger('Validation', 'warn');

const SUPPORTED_INTERP = new Set(['linear', 'bezier', 'hold', 'autoBezier', 'spring', 'inertia']);

const DEFAULT_INERTIA_DECEL = 4; // approx half-life 250ms (1000/4)

export interface MarkValidationOptions {
  to?: unknown;
  duration?: number;
  delay?: number;
  at?: number | ((index: number, entityId: number) => number);
  interp?: string;
  ease?: string | ((t: number) => number);
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: unknown;
  inertia?: InertiaParams;
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
        if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
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
      panic(
        `Stagger must be a number, function, or options object, got: ${typeof options.stagger}`,
        {
          providedType: typeof options.stagger,
        },
      );
    }
  }

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

  if (typeof options.at === 'number') {
    if (options.at < 0) {
      panic(`Mark at must be non-negative, got: ${options.at}ms`, {
        providedValue: options.at,
      });
    }
    if (options.duration !== undefined) {
      warn(`[Motion] Mark has both 'at' (absolute) and 'duration' (relative). Using 'at'.`);
    }
  }

  if (
    !options.spring &&
    !options.inertia &&
    options.at === undefined &&
    options.duration === undefined
  ) {
    panic(`Mark must have either 'at' (absolute) or 'duration' (relative)`, {
      at: options.at,
      duration: options.duration,
    });
  }

  if (options.interp && !SUPPORTED_INTERP.has(options.interp)) {
    panic(
      `Unsupported interp value: '${options.interp}'. Supported: ${Array.from(SUPPORTED_INTERP).join(', ')}`,
      { providedInterp: options.interp, supported: Array.from(SUPPORTED_INTERP) },
    );
  }

  if (options.ease && typeof options.ease !== 'function' && typeof options.ease !== 'string') {
    panic(`Mark easing must be a function or string name, got: ${typeof options.ease}`, {
      providedType: typeof options.ease,
    });
  }

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
  const normalized = { ...options };

  if (normalized.inertia) {
    const inertia = { ...normalized.inertia };
    if (inertia.deceleration === undefined) inertia.deceleration = DEFAULT_INERTIA_DECEL;
    normalized.inertia = inertia;
  }

  return normalized as T;
}
