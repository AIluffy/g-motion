import { describe, it, expect, beforeEach } from 'vitest';
import {
  World,
  MotionStateComponent,
  TimelineComponent,
  RenderComponent,
  getGPUChannelMappingRegistry,
} from '@g-motion/core';
import { motion } from '../src/api/builder';

describe('GPU channel mapping bound to timeline tracks', () => {
  beforeEach(() => {
    const registry = getGPUChannelMappingRegistry();
    registry.clear();
  });

  it('registers channel mapping from TimelineData track keys using insertion order', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);
    world.registry.register('Timeline', TimelineComponent);
    world.registry.register('Render', RenderComponent);

    motion({ x: 0, y: 0, opacity: 0 }, { world })
      .mark([
        { to: { x: 100 }, at: 1000 },
        { to: { y: 200 }, at: 1000 },
        { to: { opacity: 1 }, at: 1000 },
      ])
      .animate();

    const archetypes = Array.from(world.getArchetypes());
    expect(archetypes.length).toBe(1);
    const archetypeId = (archetypes[0] as any).id as string;

    const registry = getGPUChannelMappingRegistry();
    const table = registry.getChannels(archetypeId);
    expect(table).not.toBeNull();
    if (!table) return;
    expect(table.channels.map((c) => c.property)).toEqual(['x', 'y', 'opacity']);
  });
});
