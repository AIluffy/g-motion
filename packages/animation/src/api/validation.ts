const SUPPORTED_INTERP = new Set(['linear', 'bezier', 'hold', 'autoBezier', 'spring', 'inertia']);

const DEFAULT_INERTIA_DECEL = 4; // approx half-life 250ms (1000/4)
const DEFAULT_SNAP_THRESHOLD = 1;

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
  inertia?: { deceleration?: number; snapTo?: any; snap?: any };
  stagger?: number | ((index: number) => number);
}

export function validateMarkOptions(options: MarkValidationOptions): void {
  // Validate duration
  if (options.duration !== undefined) {
    if (typeof options.duration !== 'number') {
      throw new TypeError(
        `[Motion] Mark duration must be a number, got: ${typeof options.duration}`,
      );
    }
    if (options.duration < 0) {
      throw new RangeError(
        `[Motion] Mark duration must be non-negative, got: ${options.duration}ms`,
      );
    }
  }

  // Validate time
  if (typeof options.time === 'number') {
    if (options.time < 0) {
      throw new RangeError(`[Motion] Mark time must be non-negative, got: ${options.time}ms`);
    }
    // Warn if both time and duration provided (time takes precedence)
    if (options.duration !== undefined && typeof console !== 'undefined') {
      console.warn(
        `[Motion] Mark has both 'time' (absolute) and 'duration' (relative). Using 'time', ignoring 'duration'.`,
      );
    }
  }

  // Validate time and duration at least one is present
  if (options.time === undefined && options.duration === undefined) {
    throw new Error(
      `[Motion] Mark must have either 'time' (absolute) or 'duration' (relative). ` +
        `Got: { time: ${options.time}, duration: ${options.duration} }`,
    );
  }

  // Validate interp
  if (options.interp && !SUPPORTED_INTERP.has(options.interp)) {
    throw new Error(
      `[Motion] Unsupported interp value: '${options.interp}'. ` +
        `Supported: ${Array.from(SUPPORTED_INTERP).join(', ')}`,
    );
  }

  // Validate easing
  if (
    options.easing &&
    typeof options.easing !== 'function' &&
    typeof options.easing !== 'string'
  ) {
    throw new TypeError(
      `[Motion] Mark easing must be a function or string name, got: ${typeof options.easing}`,
    );
  }

  // Ease alias maps to easing; disallow both
  if (options.ease && options.easing) {
    throw new Error(
      `[Motion] Provide either 'ease' or 'easing', not both. Use 'easing' (preferred).`,
    );
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
      throw new TypeError(
        `[Motion] Bezier control points must be numbers, got: { cx1: ${typeof cx1}, cy1: ${typeof cy1}, cx2: ${typeof cx2}, cy2: ${typeof cy2} }`,
      );
    }
    if (cx1 < 0 || cx1 > 1 || cx2 < 0 || cx2 > 1) {
      throw new RangeError(
        `[Motion] Bezier cx1 and cx2 must be in range [0,1], got: { cx1: ${cx1}, cx2: ${cx2} }`,
      );
    }
  }

  // Validate stagger
  if (options.stagger !== undefined) {
    if (typeof options.stagger !== 'number' && typeof options.stagger !== 'function') {
      throw new TypeError(
        `[Motion] Stagger must be a number or function, got: ${typeof options.stagger}`,
      );
    }
    if (typeof options.stagger === 'number' && options.stagger < 0) {
      throw new RangeError(`[Motion] Stagger must be non-negative, got: ${options.stagger}ms`);
    }
  }
}

export function normalizeMarkOptions<T extends MarkValidationOptions>(options: T): T {
  const normalized = { ...options } as T;
  if ((normalized as any).ease && !(normalized as any).easing) {
    (normalized as any).easing = (normalized as any).ease;
  }

  if (normalized.inertia) {
    const inertia: any = { ...normalized.inertia };
    if (inertia.deceleration === undefined) inertia.deceleration = DEFAULT_INERTIA_DECEL;
    if (inertia.snapTo === undefined && inertia.snap === undefined) {
      inertia.snapTo = DEFAULT_SNAP_THRESHOLD;
    }
    normalized.inertia = inertia;
  }

  return normalized;
}
