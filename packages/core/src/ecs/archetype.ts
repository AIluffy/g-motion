import type { ComponentDef, ComponentType, ComponentValue } from '@g-motion/shared';
import { ARCHETYPE_DEFAULTS } from '../constants';

export type { ComponentValue } from '@g-motion/shared';

export type ArchetypeTypedBuffer = Float32Array | Float64Array | Int32Array;

export class TypedBufferFactory {
  private factories = new Map<ComponentType, (cap: number) => ArchetypeTypedBuffer>();

  register(type: ComponentType, factory: (cap: number) => ArchetypeTypedBuffer): void {
    this.factories.set(type, factory);
  }

  has(type: ComponentType): boolean {
    return this.factories.has(type);
  }

  create(type: ComponentType, cap: number): ArchetypeTypedBuffer | null {
    const factory = this.factories.get(type);
    if (!factory) return null;
    return factory(cap);
  }
}

const typedBufferFactory = new TypedBufferFactory();
typedBufferFactory.register('float32', (cap) => new Float32Array(cap));
typedBufferFactory.register('float64', (cap) => new Float64Array(cap));
typedBufferFactory.register('int32', (cap) => new Int32Array(cap));

export function getTypedBufferFactory(): TypedBufferFactory {
  return typedBufferFactory;
}

/**
 * Internal interface for BurstManager to access archetype internals
 * This avoids 'as any' casts while keeping implementation details private
 */
export interface ArchetypeInternal {
  getInternalCapacity(): number;
  getInternalCount(): number;
  getInternalEntityIndices(): Map<number, number>;
  getInternalIndicesMap(): Map<number, number>;
  getInternalBuffers(): Map<string, Array<ComponentValue | undefined>>;
  setInternalCount(count: number): void;
  resize(newCapacity: number): void;
}

export class Archetype implements ArchetypeInternal {
  private buffers = new Map<string, Array<ComponentValue | undefined>>();
  private typedBuffers = new Map<string, ArchetypeTypedBuffer>();
  private typedFieldsByComponent = new Map<string, Map<string, ArchetypeTypedBuffer>>();
  private missingTypedFieldWarnings = new Set<string>();
  private setFieldCacheComponent = '';
  private setFieldCacheField = '';
  private setFieldCacheBuffer: Array<ComponentValue | undefined> | undefined;
  private setFieldCacheTypedBuffer: ArchetypeTypedBuffer | undefined;
  private capacity: number = ARCHETYPE_DEFAULTS.INITIAL_CAPACITY;
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

  addEntity(entityId: number, data: Record<string, ComponentValue | undefined>): void {
    if (this.count >= this.capacity) {
      this.resize(this.capacity * ARCHETYPE_DEFAULTS.GROWTH_FACTOR);
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
                const val = Number(compData[prop] ?? 0);
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
    this.resetSetFieldCache();

    // Resize structured buffers (object arrays)
    for (const [name, buffer] of this.buffers) {
      const newBuffer = Array.from<ComponentValue | undefined>({ length: newCapacity });
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

  getBuffer(name: string): Array<ComponentValue | undefined> | undefined {
    return this.buffers.get(name);
  }

  getTypedBuffer(componentName: string, prop: string): ArchetypeTypedBuffer | undefined {
    return this.typedFieldsByComponent.get(componentName)?.get(prop);
  }

  /**
   * 原子化设置某实体某组件某字段的数值，同时同步 TypedBuffer 和 ObjectBuffer。
   * 仅适用于数值类型字段（float32/float64/int32）。
   */
  setField(componentName: string, fieldName: string, index: number, value: number): void {
    let buffer = this.setFieldCacheBuffer;
    let typedBuffer = this.setFieldCacheTypedBuffer;

    if (this.setFieldCacheComponent !== componentName || this.setFieldCacheField !== fieldName) {
      buffer = this.buffers.get(componentName);
      if (!buffer) return;
      typedBuffer = this.typedFieldsByComponent.get(componentName)?.get(fieldName);

      this.setFieldCacheComponent = componentName;
      this.setFieldCacheField = fieldName;
      this.setFieldCacheBuffer = buffer;
      this.setFieldCacheTypedBuffer = typedBuffer;
    }

    const component = buffer[index];
    if (component && typeof component === 'object') {
      (component as Record<string, unknown>)[fieldName] = value;
    }

    if (typedBuffer) {
      typedBuffer[index] = value;
      return;
    }

    const warningKey = this.makeTypedKey(componentName, fieldName);
    if (this.missingTypedFieldWarnings.has(warningKey)) return;
    this.missingTypedFieldWarnings.add(warningKey);
    console.warn(
      'TypedBuffer not found for ' + componentName + '.' + fieldName + '; wrote ObjectBuffer only.',
    );
  }

  /**
   * 批量设置同一实体同一组件的多个字段。
   */
  setFields(componentName: string, index: number, fields: Record<string, number>): void {
    for (const [fieldName, value] of Object.entries(fields)) {
      this.setField(componentName, fieldName, index, value);
    }
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

  getEntityIndex(entityId: number): number | undefined {
    return this.entityIndices.get(entityId);
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
        const arr = typedBufferFactory.create(type, cap);
        if (!arr) continue;
        this.typedBuffers.set(key, arr);

        let typedFields = this.typedFieldsByComponent.get(compName);
        if (!typedFields) {
          typedFields = new Map<string, ArchetypeTypedBuffer>();
          this.typedFieldsByComponent.set(compName, typedFields);
        }
        typedFields.set(prop, arr);
      }
    }
  }

  private isNumericType(type: ComponentType): boolean {
    return typedBufferFactory.has(type);
  }

  private makeTypedKey(componentName: string, prop: string): string {
    return `${componentName}.${prop}`;
  }

  private resetSetFieldCache(): void {
    this.setFieldCacheComponent = '';
    this.setFieldCacheField = '';
    this.setFieldCacheBuffer = undefined;
    this.setFieldCacheTypedBuffer = undefined;
  }

  private allocateTyped(ref: ArchetypeTypedBuffer, cap: number): ArchetypeTypedBuffer {
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

  getInternalBuffers(): Map<string, Array<ComponentValue | undefined>> {
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
