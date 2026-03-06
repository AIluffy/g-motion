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

export type SchedulerView = object;

export type AppView = object;

export type ConfigView = object;

export type BatchProcessorView = object;

export type MetricsView = object;

export type AppContextView = object;

export interface DefaultServices {
  world: WorldView | undefined;
  scheduler?: SchedulerView;
  app?: AppView;
  config?: ConfigView;
  batchProcessor?: BatchProcessorView;
  metrics?: MetricsView;
  appContext?: AppContextView;
}

export interface SystemContext<TServices = DefaultServices> {
  nowMs?: number;
  services: TServices;
}

export type SystemPhase = 'preUpdate' | 'update' | 'physics' | 'postUpdate' | 'render';

export interface SystemDef {
  name: string;
  order?: number;
  phase?: SystemPhase;
  reads?: readonly string[];
  writes?: readonly string[];
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
