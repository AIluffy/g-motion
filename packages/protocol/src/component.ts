export type ComponentValue = Record<string, unknown>;
export type ComponentType = 'float32' | 'float64' | 'int32' | 'string' | 'object';

export interface ComponentDef {
  schema: Record<string, ComponentType>;
}

export interface BatchContext {
  lastBatchId?: string;
  entityCount?: number;
  archetypeBatchesReady?: boolean;
  timestamp?: number;
}
