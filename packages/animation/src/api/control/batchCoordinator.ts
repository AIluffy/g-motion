import { World, WorldProvider } from '@g-motion/core';
import type { AnimationControl } from '../control';

export class BatchCoordinator {
  private entityIds: number[];
  private controls: AnimationControl[];
  private isBatch: boolean;
  private injectedWorld?: World;

  constructor(params: {
    entityId: number | number[];
    controls?: AnimationControl[];
    isBatch?: boolean;
    world?: World;
  }) {
    const { entityId, controls, isBatch, world } = params;

    if (Array.isArray(entityId)) {
      this.entityIds = entityId;
      this.controls = controls || [];
      this.isBatch = !!isBatch;
    } else {
      this.entityIds = [entityId];
      this.controls = [];
      this.isBatch = false;
    }

    this.injectedWorld = world;
  }

  getWorld(): World {
    return this.injectedWorld ?? WorldProvider.useWorld();
  }

  forEachControl(single: () => void, batch?: (control: AnimationControl) => void): void {
    if (this.isBatch && this.controls.length > 0 && batch) {
      for (const control of this.controls) {
        batch(control);
      }
      return;
    }
    single();
  }

  getPrimaryEntityId(): number {
    return this.entityIds[0] ?? 0;
  }

  getEntityIds(): number[] {
    return [...this.entityIds];
  }

  getControls(): AnimationControl[] {
    return [...this.controls];
  }

  getCount(): number {
    return this.entityIds.length;
  }

  isBatchAnimation(): boolean {
    return this.isBatch;
  }

  getEntityIdView(): readonly number[] {
    return this.entityIds;
  }

  clearReferences(): void {
    this.controls.length = 0;
    this.entityIds.length = 0;
  }
}
