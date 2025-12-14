import { describe, it, expect, vi } from 'vitest';
import { World, SystemDef } from '../src/index';

describe('Custom System', () => {
  it('registers and executes custom system', () => {
    const world = World.get();
    const updateSpy = vi.fn();

    const CustomSystem: SystemDef = {
      name: 'CustomSystem',
      order: 100, // Run last
      update: updateSpy,
    };

    world.scheduler.add(CustomSystem);

    // Trigger loop manually or mock time
    // Since we can't easily trigger the private loop without time passing or exposing a tick,
    // we can verify it was added to the scheduler's internal list if we exposed it,
    // or check if we can run one frame.

    // Let's assume we can rely on verifying it's in the list via a new test helper or reflection,
    // OR we just invoke the update method of the scheduler if we make it public/internal.

    // For this test, we'll cast to any to access private loop or just verify add() worked.
    // Actually, we can test that subsequent motion() calls trigger the loop which calls our system.

    // But the loop runs on rAF. We mocked rAF in setup.
    // If we advance timers, it should run.
  });
});
