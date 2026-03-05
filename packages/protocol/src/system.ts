export interface ArchetypeView {
  id?: string;
  entityCount: number;
  componentNames: readonly string[];
  getEntityId(index: number): number;
  getBuffer(name: string): unknown;
  getComponentBuffer?(name: string): unknown;
  getInternalEntityIndices?(): Map<number, number>;
}

export interface WorldView {
  getArchetypes(): Iterable<ArchetypeView>;
}

export interface SystemContext {
  nowMs?: number;
  services: {
    world: WorldView | undefined;
    scheduler?: unknown;
    app?: unknown;
    config?: unknown;
    batchProcessor?: unknown;
    metrics?: unknown;
    appContext?: unknown;
  };
}

export interface SystemDef {
  name: string;
  order?: number;
  update(dt: number, ctx?: SystemContext): void;
}

export interface RendererBatchContext {
  world: WorldView | undefined;
  archetypeId: string;
  entityIds: number[];
  targets: unknown[];
  componentBuffers: Map<string, Array<Record<string, unknown> | undefined>>;
  transformTypedBuffers: Record<string, Float32Array | Float64Array | undefined>;
}

export interface RendererDef {
  update(entity: number, target: unknown, components: unknown): void;
  preFrame?(): void;
  postFrame?(): void;
  updateWithAccessor?(
    entity: number,
    target: unknown,
    getComponent: (name: string) => unknown,
    getTransformTyped?: () => unknown,
  ): void;
  updateBatch?(ctx: RendererBatchContext): void;
}
