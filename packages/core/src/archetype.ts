import { ComponentDef, ComponentType } from './plugin';

/**
 * Type for component data values
 */
type ComponentValue = unknown;

/**
 * Internal interface for BurstManager to access archetype internals
 * This avoids 'as any' casts while keeping implementation details private
 */
export interface ArchetypeInternal {
  getInternalCapacity(): number;
  getInternalCount(): number;
  getInternalEntityIndices(): Map<number, number>;
  getInternalIndicesMap(): Map<number, number>;
  getInternalBuffers(): Map<string, Array<ComponentValue>>;
  setInternalCount(count: number): void;
  resize(newCapacity: number): void;
}

export class Archetype implements ArchetypeInternal {
  private buffers = new Map<string, Array<ComponentValue>>();
  private typedBuffers = new Map<string, Float32Array | Float64Array | Int32Array>();
  private capacity = 1024;
  private count = 0;
  private entityIndices = new Map<number, number>(); // Entity ID -> Index
  private indicesMap = new Map<number, number>(); // Index -> Entity ID (reverse lookup for O(1) access)

  constructor(
    public readonly id: string,
    private components: Map<string, ComponentDef>,
  ) {
    // Pre-allocate typed buffers for numeric component fields (SoA layout)
    this.initializeBuffers(this.capacity);
  }

  addEntity(entityId: number, data: Record<string, ComponentValue>): void {
    if (this.count >= this.capacity) {
      this.resize(this.capacity * 2);
    }
    const index = this.count++;
    this.entityIndices.set(entityId, index);
    this.indicesMap.set(index, entityId); // Maintain reverse mapping

    for (const [compName, _compDef] of this.components) {
      const compData = data[compName];
      if (compData) {
        let buffer = this.buffers.get(compName);
        if (!buffer) {
          // Initialize buffer for structured component storage (AoS-like)
          buffer = Array.from({ length: this.capacity });
          this.buffers.set(compName, buffer);
        }
        buffer[index] = compData;

        // Populate typed buffers for numeric fields when available
        const compDef = this.components.get(compName);
        if (compDef && compDef.schema && typeof compData === 'object' && compData !== null) {
          for (const [prop, type] of Object.entries(compDef.schema)) {
            if (this.isNumericType(type)) {
              const key = this.makeTypedKey(compName, prop);
              const tbuf = this.typedBuffers.get(key);
              if (tbuf) {
                const dataObj = compData as Record<string, unknown>;
                const val = Number(dataObj[prop] ?? 0);
                tbuf[index] = Number.isFinite(val) ? val : 0;
              }
            }
          }
        }
      }
    }
  }

  resize(newCapacity: number): void {
    this.capacity = newCapacity;

    // Resize structured buffers (object arrays)
    for (const [name, buffer] of this.buffers) {
      const newBuffer = Array.from<ComponentValue>({ length: newCapacity });
      for (let i = 0; i < this.count; i++) {
        newBuffer[i] = buffer[i];
      }
      this.buffers.set(name, newBuffer);
    }

    // Resize typed buffers efficiently
    for (const [key, buffer] of this.typedBuffers) {
      const newBuffer = this.allocateTyped(buffer, newCapacity);
      newBuffer.set(buffer.subarray(0, this.count));
      this.typedBuffers.set(key, newBuffer);
    }
  }

  getBuffer(name: string): Array<ComponentValue> | undefined {
    return this.buffers.get(name);
  }

  getTypedBuffer(
    componentName: string,
    prop: string,
  ): Float32Array | Float64Array | Int32Array | undefined {
    return this.typedBuffers.get(this.makeTypedKey(componentName, prop));
  }

  get entityCount(): number {
    return this.count;
  }

  get componentNames(): string[] {
    return Array.from(this.components.keys());
  }

  getEntityData(entityId: number, componentName: string): ComponentValue | undefined {
    const index = this.entityIndices.get(entityId);
    if (index === undefined) return undefined;
    const buffer = this.buffers.get(componentName);
    if (!buffer) return undefined;
    return buffer[index];
  }

  getEntityId(index: number): number {
    const entityId = this.indicesMap.get(index);
    return entityId !== undefined ? entityId : -1;
  }

  // =============================
  // Internal: buffer management
  // =============================

  private initializeBuffers(cap: number): void {
    // Create typed buffers based on component schemas
    for (const [compName, def] of this.components) {
      if (!def || !def.schema) continue;
      for (const [prop, type] of Object.entries(def.schema)) {
        if (!this.isNumericType(type)) continue;
        const key = this.makeTypedKey(compName, prop);
        // Allocate correct typed array
        let arr: Float32Array | Float64Array | Int32Array;
        switch (type) {
          case 'float32':
            arr = new Float32Array(cap);
            break;
          case 'float64':
            arr = new Float64Array(cap);
            break;
          case 'int32':
            arr = new Int32Array(cap);
            break;
          default:
            continue;
        }
        this.typedBuffers.set(key, arr);
      }
    }
  }

  private isNumericType(type: ComponentType): boolean {
    return type === 'float32' || type === 'float64' || type === 'int32';
  }

  private makeTypedKey(componentName: string, prop: string): string {
    return `${componentName}.${prop}`;
  }

  private allocateTyped(
    ref: Float32Array | Float64Array | Int32Array,
    cap: number,
  ): Float32Array | Float64Array | Int32Array {
    if (ref instanceof Float32Array) return new Float32Array(cap);
    if (ref instanceof Float64Array) return new Float64Array(cap);
    return new Int32Array(cap);
  }

  // =============================================================================
  // ArchetypeInternal interface implementation
  // =============================================================================

  getInternalCapacity(): number {
    return this.capacity;
  }

  getInternalCount(): number {
    return this.count;
  }

  getInternalEntityIndices(): Map<number, number> {
    return this.entityIndices;
  }

  getInternalIndicesMap(): Map<number, number> {
    return this.indicesMap;
  }

  getInternalBuffers(): Map<string, Array<ComponentValue>> {
    return this.buffers;
  }

  setInternalCount(count: number): void {
    this.count = count;
  }
}

// =============================================================================
// Private helpers
// =============================================================================

// (unused helper removed)
