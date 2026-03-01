/**
 * Generic Registry with ID allocation and versioning
 *
 * A reusable registry pattern supporting:
 * - ID allocation (auto-incrementing)
 * - Version tracking (increments on mutation)
 * - Entry storage and retrieval
 * - Bulk operations and cleanup
 */

export interface RegistryEntry {
  id: number;
}

export interface RegistryOptions {
  /** Starting ID for auto-allocation (default: 0) */
  startId?: number;
  /** Initial version number (default: 0) */
  initialVersion?: number;
}

export class Registry<T extends RegistryEntry> {
  private entries = new Map<string, T>();
  private nextId: number;
  private version: number;
  private startId: number;

  constructor(options: RegistryOptions = {}) {
    this.startId = options.startId ?? 0;
    this.nextId = this.startId;
    this.version = options.initialVersion ?? 0;
  }

  /**
   * Register a new entry with auto-allocated ID
   * @param key - Unique identifier
   * @param entry - Entry data (without id, which will be auto-assigned)
   * @returns The assigned ID
   */
  register(key: string, entry: Omit<T, 'id'>): number {
    const id = this.allocateId();
    this.entries.set(key, { ...entry, id } as T);
    this.bumpVersion();
    return id;
  }

  /**
   * Get an entry by key
   */
  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Get all registered entries
   */
  getAll(): ReadonlyArray<T & { key: string }> {
    const result: Array<T & { key: string }> = [];
    for (const [key, entry] of this.entries) {
      result.push({ ...entry, key });
    }
    return result;
  }

  /**
   * Get current version (increments on each registration)
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Get the next available ID (without allocating)
   */
  peekNextId(): number {
    return this.nextId;
  }

  /**
   * Clear all entries and reset state
   */
  clear(): void {
    this.entries.clear();
    this.nextId = this.startId;
    this.version = 0;
  }

  /**
   * Allocate a new ID and increment the counter
   */
  private allocateId(): number {
    return this.nextId++;
  }

  /**
   * Bump the version number
   */
  private bumpVersion(): void {
    this.version++;
  }
}

/**
 * Registry with built-in defaults lookup
 *
 * Extends Registry with support for built-in entries that are
 * looked up separately from custom registrations.
 */
export class RegistryWithDefaults<T extends RegistryEntry> extends Registry<T> {
  private defaults: Readonly<Record<string, number>>;

  constructor(options: RegistryOptions & { defaults: Record<string, number> }) {
    super(options);
    this.defaults = options.defaults;
  }

  /**
   * Lookup an ID by key, checking defaults first then custom entries
   * @param key - The key to lookup
   * @returns The ID or undefined if not found
   */
  lookup(key: string): number | undefined {
    // Check defaults first (O(1) lookup)
    const defaultId = this.defaults[key];
    if (defaultId !== undefined) {
      return defaultId;
    }

    // Check custom entries
    const entry = this.get(key);
    return entry?.id;
  }

  /**
   * Get all default entries
   */
  getDefaults(): Readonly<Record<string, number>> {
    return this.defaults;
  }
}
