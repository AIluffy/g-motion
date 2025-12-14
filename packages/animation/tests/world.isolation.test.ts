import { describe, it, expect, beforeEach } from 'vitest';
import { World, WorldProvider } from '@g-motion/core';
import { motion } from '../src/api/builder';

describe('WorldProvider multi-world isolation', () => {
  let world1: World;
  let world2: World;

  beforeEach(() => {
    // Create two independent worlds
    world1 = new World();
    world2 = new World();
  });

  it('isolates entities between different worlds', () => {
    // Animate in world1
    const ctrl1 = WorldProvider.withWorld(world1, () => {
      return motion(0, { world: world1 })
        .mark([{ to: 100, time: 500 }])
        .animate();
    });

    // Animate in world2
    const ctrl2 = WorldProvider.withWorld(world2, () => {
      return motion(0, { world: world2 })
        .mark([{ to: 200, time: 800 }])
        .animate();
    });

    // Verify entities are in different worlds
    const entities1 = ctrl1.getEntityIds();
    const entities2 = ctrl2.getEntityIds();

    expect(entities1.length).toBe(1);
    expect(entities2.length).toBe(1);

    // Verify world1 has only its entity
    const arch1 = world1.getEntityArchetype(entities1[0]);
    expect(arch1).toBeDefined();
    expect(world1.getEntityArchetype(entities2[0])).toBeUndefined();

    // Verify world2 has only its entity
    const arch2 = world2.getEntityArchetype(entities2[0]);
    expect(arch2).toBeDefined();
    expect(world2.getEntityArchetype(entities1[0])).toBeUndefined();
  });

  it('maintains independent scheduler states', () => {
    let world1Updates = 0;
    let world2Updates = 0;

    WorldProvider.withWorld(world1, () => {
      motion(0, { world: world1 })
        .mark([{ to: 100, time: 500 }])
        .animate({ onUpdate: () => world1Updates++ });
    });

    WorldProvider.withWorld(world2, () => {
      motion(0, { world: world2 })
        .mark([{ to: 200, time: 800 }])
        .animate({ onUpdate: () => world2Updates++ });
    });

    // Start only world1 scheduler
    world1.scheduler.start();

    // Give some time for updates (note: in real tests you'd advance time manually)
    expect(world1.scheduler['isRunning']).toBe(true);
    expect(world2.scheduler['isRunning']).toBe(false);
  });

  it('restores previous default world after withWorld scope', () => {
    WorldProvider.setDefault(world1);

    const initialWorld = WorldProvider.useWorld();
    expect(initialWorld).toBe(world1);

    let scopedWorld: World | undefined;
    WorldProvider.withWorld(world2, (w) => {
      scopedWorld = WorldProvider.useWorld();
      expect(scopedWorld).toBe(world2);
      return null;
    });

    const restoredWorld = WorldProvider.useWorld();
    expect(restoredWorld).toBe(world1);
  });

  it('handles batch animations with scoped world', () => {
    const targets = [0, 1, 2];

    const ctrl = WorldProvider.withWorld(world1, () => {
      return motion(targets, { world: world1 })
        .mark([{ to: 100, time: 500, stagger: 50 }])
        .animate();
    });

    expect(ctrl.isBatchAnimation()).toBe(true);
    expect(ctrl.getCount()).toBe(3);

    const entityIds = ctrl.getEntityIds();
    entityIds.forEach((entityId) => {
      const arch = world1.getEntityArchetype(entityId);
      expect(arch).toBeDefined();
      // Verify not in world2
      expect(world2.getEntityArchetype(entityId)).toBeUndefined();
    });
  });
});
