/**
 * EasingRegistry - GPU Easing Function Registry
 *
 * A class-based registry for managing easing functions used in GPU shaders.
 * Supports built-in easings, aliases, and custom WGSL easing registration.
 */

import { panic } from '../error';

/**
 * Easing entry interface representing a registered easing function
 */
export interface EasingEntry {
  /** Unique numeric identifier for the easing function */
  id: number;
  /** Human-readable name of the easing function */
  name: string;
  /** WGSL function code (for custom GPU easings) */
  wgslFn?: string;
}

/**
 * EasingRegistry class for managing easing functions.
 *
 * This class encapsulates all easing-related state and provides methods
 * for registering custom GPU easings and looking up easing IDs.
 *
 * @example
 * ```typescript
 * const registry = new EasingRegistry();
 * const id = registry.getId('easeInQuad'); // Returns 1
 *
 * // Register custom easing
 * registry.register('myEase', 'fn myEase(t: f32) -> f32 { return t * t; }');
 * ```
 */
export class EasingRegistry {
  /**
   * Built-in easing name to ID mapping (shared across all instances)
   */
  static readonly BUILTIN_EASINGS: ReadonlyMap<string, number> = new Map([
    ['linear', 0],
    ['easeInQuad', 1],
    ['easeOutQuad', 2],
    ['easeInOutQuad', 3],
    ['easeInCubic', 4],
    ['easeOutCubic', 5],
    ['easeInOutCubic', 6],
    ['easeInQuart', 7],
    ['easeOutQuart', 8],
    ['easeInOutQuart', 9],
    ['easeInQuint', 10],
    ['easeOutQuint', 11],
    ['easeInOutQuint', 12],
    ['easeInSine', 13],
    ['easeOutSine', 14],
    ['easeInOutSine', 15],
    ['easeInExpo', 16],
    ['easeOutExpo', 17],
    ['easeInOutExpo', 18],
    ['easeInCirc', 19],
    ['easeOutCirc', 20],
    ['easeInOutCirc', 21],
    ['easeInBack', 22],
    ['easeOutBack', 23],
    ['easeInOutBack', 24],
    ['easeInElastic', 25],
    ['easeOutElastic', 26],
    ['easeInOutElastic', 27],
    ['easeInBounce', 28],
    ['easeOutBounce', 29],
    ['easeInOutBounce', 30],
  ]);

  /**
   * Easing name aliases (shared across all instances)
   */
  static readonly ALIASES: ReadonlyMap<string, string> = new Map([
    ['easeIn', 'easeInQuad'],
    ['easeOut', 'easeOutQuad'],
    ['easeInOut', 'easeInOutQuad'],
    ['ease-in', 'easeInQuad'],
    ['ease-out', 'easeOutQuad'],
    ['ease-in-out', 'easeInOutQuad'],
  ]);

  /** Custom easing entries map */
  private _customEasings: Map<string, EasingEntry>;
  /** Next available ID for custom easings */
  private _nextId: number;
  /** Version counter, increments on each registration */
  private _version: number;
  /** Set to track already-logged unknown easing warnings */
  private _loggedUnknown: Set<string>;

  /**
   * Creates a new EasingRegistry instance
   * @param startId - Starting ID for custom easings (default: 100)
   */
  constructor(startId = 100) {
    this._customEasings = new Map();
    this._nextId = startId;
    this._version = 0;
    this._loggedUnknown = new Set();
  }

  /**
   * Extract WGSL function name from code
   * @param code - WGSL function code
   * @returns Function name or undefined if not found
   */
  private extractWgslFnName(code: string): string | undefined {
    const match = code.match(/fn\s+(\w+)\s*\(/);
    return match?.[1];
  }

  /**
   * Register a custom GPU easing function
   *
   * @param name - Name for the easing function
   * @param wgslCode - WGSL function code (e.g., 'fn myEase(t: f32) -> f32 { return t * t; }')
   * @returns The registered easing entry
   *
   * @remarks
   * This method is idempotent - registering the same name twice returns the existing entry.
   */
  register(name: string, wgslCode: string): EasingEntry {
    // Check if already registered (idempotent)
    const existing = this._customEasings.get(name);
    if (existing) {
      return existing;
    }

    // Extract function name from WGSL code for validation
    const fnName = this.extractWgslFnName(wgslCode);
    if (!fnName) {
      panic(
        'Invalid WGSL easing: missing function declaration (expected: fn name(t: f32) -> f32 { ... })',
        { wgslCode },
      );
    }

    const entry: EasingEntry = {
      id: this._nextId++,
      name,
      wgslFn: wgslCode,
    };

    this._customEasings.set(name, entry);
    this._version++;

    return entry;
  }

  /**
   * Get the easing ID for a given easing name
   *
   * Lookup priority:
   * 1. Built-in easings (BUILTIN_EASINGS)
   * 2. Aliases (ALIASES → resolve to built-in)
   * 3. Custom easings
   * 4. Fallback to linear (0) with a warning (logged only once per unknown name)
   *
   * @param name - Easing name (built-in, alias, or custom)
   * @returns Easing ID (0-30 for built-in, 31+ for custom, 0 for unknown)
   */
  getId(name: string): number {
    if (!name) return 0; // linear

    // 1. Check built-in easings
    const builtinId = EasingRegistry.BUILTIN_EASINGS.get(name);
    if (builtinId !== undefined) {
      return builtinId;
    }

    // 2. Check aliases and resolve
    const aliasTarget = EasingRegistry.ALIASES.get(name);
    if (aliasTarget) {
      const aliasedId = EasingRegistry.BUILTIN_EASINGS.get(aliasTarget);
      if (aliasedId !== undefined) {
        return aliasedId;
      }
    }

    // 3. Check custom easings
    const custom = this._customEasings.get(name);
    if (custom) {
      return custom.id;
    }

    // 4. Fallback to linear with warning (logged only once)
    if (!this._loggedUnknown.has(name)) {
      this._loggedUnknown.add(name);
      // eslint-disable-next-line no-console
      console.warn(`[Motion] Unknown easing "${name}", falling back to linear`);
    }

    return 0; // linear
  }

  /**
   * Get the full easing entry for a given easing name
   *
   * @param name - Easing name
   * @returns Easing entry or undefined if not found
   */
  getEntry(name: string): EasingEntry | undefined {
    if (!name) return undefined;

    // Check custom easings first
    const custom = this._customEasings.get(name);
    if (custom) {
      return custom;
    }

    // Check if it's a built-in
    const builtinId = EasingRegistry.BUILTIN_EASINGS.get(name);
    if (builtinId !== undefined) {
      return { id: builtinId, name };
    }

    // Check aliases
    const aliasTarget = EasingRegistry.ALIASES.get(name);
    if (aliasTarget) {
      const aliasedId = EasingRegistry.BUILTIN_EASINGS.get(aliasTarget);
      if (aliasedId !== undefined) {
        return { id: aliasedId, name: aliasTarget };
      }
    }

    return undefined;
  }

  /**
   * Get all registered custom GPU easings for shader injection
   * @returns Array of custom easing entries
   */
  getCustomGpuEasings(): ReadonlyArray<{ name: string; wgslFn: string; id: number }> {
    return Array.from(this._customEasings.entries()).map(([name, entry]) => ({
      name,
      wgslFn: entry.wgslFn ?? '',
      id: entry.id,
    }));
  }

  /**
   * Get the current version of custom easings (increments on each registration)
   */
  get version(): number {
    return this._version;
  }

  /**
   * Get the count of custom easings registered
   */
  get customCount(): number {
    return this._customEasings.size;
  }

  /**
   * Reset the registry state
   *
   * Clears:
   * - All custom easings
   * - Logged unknown easing warnings
   * - Version counter (reset to 0)
   *
   * Note: Does NOT reset the ID counter (_nextId) to expose potential ID conflicts in tests
   */
  reset(): void {
    this._customEasings.clear();
    this._loggedUnknown.clear();
    this._version = 0;
  }

  /**
   * Hard reset the registry state including ID counter
   *
   * @param startId - New starting ID for custom easings (default: 100)
   */
  hardReset(startId = 100): void {
    this.reset();
    this._nextId = startId;
  }

  // ==================== Backward Compatibility Methods ====================

  /**
   * Get the easing ID for a given easing name.
   *
   * @param name - Easing name (built-in, alias, or custom)
   * @returns Easing ID (0-30 for built-in, 31+ for custom)
   * @deprecated Use getId() instead
   */
  getEasingId(name?: string): number {
    return this.getId(name ?? '');
  }

  /**
   * Register a custom WGSL easing function.
   *
   * @param wgslFn - Full WGSL function definition
   * @returns The registered easing name (extracted from WGSL)
   * @deprecated Use register(name, wgslCode) instead
   */
  registerGpuEasing(wgslFn: string): string {
    const match = wgslFn.match(/fn\s+(\w+)\s*\(/);
    if (!match) {
      panic(
        'Invalid WGSL easing: missing function declaration (expected: fn name(t: f32) -> f32 { ... })',
        { wgslFn },
      );
    }
    const name = match[1];
    this.register(name, wgslFn);
    return name;
  }

  /**
   * Get the current version of custom easings.
   *
   * @returns Current version number
   * @deprecated Use version getter instead
   */
  getCustomEasingVersion(): number {
    return this._version;
  }

  /**
   * Clear all custom easings and reset state.
   *
   * @deprecated Use reset() instead
   */
  clear(): void {
    this.reset();
  }
}
