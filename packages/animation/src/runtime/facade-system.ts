import type { ComponentDef, SystemDef } from '@g-motion/core/runtime';

import { updateControllerFromSystem } from '../controllers/shared';
import { ensureAnimationRuntime } from './bootstrap';

export const AnimationBindingComponent: ComponentDef = {
  schema: {
    state: 'object',
  },
};

export const AnimationFacadeSystem: SystemDef = {
  name: 'AnimationFacadeSystem',
  order: 29,
  update(_dt, ctx) {
    const world = ensureAnimationRuntime().world;

    const timestamp = ctx?.nowMs ?? Date.now();
    const archetypes = Array.from(world.getArchetypes()).filter((archetype) =>
      archetype.componentNames.includes('AnimationBinding'),
    );

    for (const archetype of archetypes) {
      const bindingBuffer = archetype.getBuffer('AnimationBinding');
      if (!bindingBuffer) {
        continue;
      }

      for (let index = 0; index < archetype.entityCount; index++) {
        const binding = bindingBuffer[index] as
          | { state?: Parameters<typeof updateControllerFromSystem>[0] }
          | undefined;
        if (!binding?.state) {
          continue;
        }
        updateControllerFromSystem(binding.state, timestamp);
      }
    }
  },
};
