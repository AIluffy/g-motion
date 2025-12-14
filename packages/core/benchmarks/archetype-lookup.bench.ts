import { describe, bench } from 'vitest';
import { Archetype } from '../src/archetype';

describe('Archetype Lookup Performance', () => {
  bench(
    'getEntityId() - O(1) optimized (reverse index)',
    () => {
      const archetype = new Archetype('test', new Map());

      // Add 1000 entities
      for (let i = 0; i < 1000; i++) {
        archetype.addEntity(i, {});
      }

      // Benchmark: lookup entities at various positions
      // With O(1) reverse index, this should be instant
      for (let i = 0; i < 1000; i++) {
        const entityId = archetype.getEntityId(i);
        if (entityId === -1) {
          throw new Error('Entity not found');
        }
      }
    },
    {
      setup: () => {
        // Warm up
        const archetype = new Archetype('warmup', new Map());
        for (let i = 0; i < 100; i++) {
          archetype.addEntity(i, {});
        }
      },
    },
  );

  bench(
    'getEntityId() - simulated O(n) baseline (for comparison)',
    () => {
      const archetype = new Archetype('test-baseline', new Map());

      // Add 1000 entities
      for (let i = 0; i < 1000; i++) {
        archetype.addEntity(i, {});
      }

      // Simulate O(n) lookup by iterating entityIndices map
      // This is what the old code was doing
      const entityIndices = (archetype as any).entityIndices as Map<number, number>;
      for (let i = 0; i < 1000; i++) {
        let found = false;
        for (const [_entityId, entityIndex] of entityIndices) {
          if (entityIndex === i) {
            found = true;
            break;
          }
        }
        if (!found) {
          throw new Error('Entity not found');
        }
      }
    },
    {
      setup: () => {
        // Warm up
        const archetype = new Archetype('warmup', new Map());
        for (let i = 0; i < 100; i++) {
          archetype.addEntity(i, {});
        }
      },
    },
  );

  bench(
    'getEntityId() - high frequency per-frame lookup (100 entities, 60 calls)',
    () => {
      const archetype = new Archetype('frame-test', new Map());

      // Simulate 100 active entities
      for (let i = 0; i < 100; i++) {
        archetype.addEntity(i, {});
      }

      // Simulate per-frame lookups: 60 calls per entity
      for (let frame = 0; frame < 60; frame++) {
        for (let i = 0; i < 100; i++) {
          archetype.getEntityId(i);
        }
      }
    },
    {
      setup: () => {
        const archetype = new Archetype('warmup', new Map());
        for (let i = 0; i < 50; i++) {
          archetype.addEntity(i, {});
        }
      },
    },
  );

  bench('getEntityId() - stress test (10000 entities, random access)', () => {
    const archetype = new Archetype('stress-test', new Map());

    // Add 10000 entities
    for (let i = 0; i < 10000; i++) {
      archetype.addEntity(i, {});
    }

    // Random access pattern (simulates real-world scenario)
    for (let i = 0; i < 1000; i++) {
      const randomIndex = Math.floor(Math.random() * 10000);
      archetype.getEntityId(randomIndex);
    }
  });
});
