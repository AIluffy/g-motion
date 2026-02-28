import { describe, expect, test } from 'vitest';
import { ComputeBatchProcessor } from '../src/systems/batch';
import type { BatchEntity, BatchKeyframe, BatchResult } from '../src/systems/batch';
import { World } from '../src/world';
import { MotionStateComponent } from '../src/components/state';

describe('Batch cleanup and entity deletion', () => {
  test('clearBatch releases cached data and buffers', () => {
    const processor = new ComputeBatchProcessor();
    const batchId = 'batch-1';
    const entities: BatchEntity[] = [
      { id: 1, startTime: 0, currentTime: 10, playbackRate: 1, status: 1 },
    ];
    const keyframes: BatchKeyframe[] = [
      { entityId: 1, startTime: 0, duration: 100, startValue: 0, endValue: 1, easingId: 0 },
    ];
    const results: BatchResult[] = [{ entityId: 1, interpolatedValue: 0.5, timestamp: 123 }];

    processor.createBatch(batchId, entities);
    processor.addKeyframes(batchId, keyframes);
    processor.storeResults(batchId, results);
    expect(processor.getResults(batchId)).toEqual(results);
    expect(processor.getEntityBufferData(batchId)).not.toBeNull();
    expect(processor.getKeyframeBufferData(batchId)).not.toBeNull();

    processor.clearBatch(batchId);

    expect(processor.getResults(batchId)).toBeNull();
    expect(processor.getEntityBufferData(batchId)).toBeNull();
    expect(processor.getKeyframeBufferData(batchId)).toBeNull();
    expect(processor.getBatchSize(batchId)).toBe(0);
  });

  test('flushDeletions updates EntityManager state', () => {
    const world = new World();
    world.registry.register('MotionState', MotionStateComponent);

    const entityA = world.createEntity({
      MotionState: {
        status: 1,
        delay: 0,
        startTime: 0,
        pausedAt: 0,
        currentTime: 0,
        playbackRate: 1,
        iteration: 0,
        tickInterval: 0,
        tickPhase: 0,
        tickPriority: 0,
      },
    });
    const entityB = world.createEntity({
      MotionState: {
        status: 1,
        delay: 0,
        startTime: 0,
        pausedAt: 0,
        currentTime: 0,
        playbackRate: 1,
        iteration: 0,
        tickInterval: 0,
        tickPhase: 0,
        tickPriority: 0,
      },
    });

    expect(world.entityManager.exists(entityA)).toBe(true);
    expect(world.entityManager.exists(entityB)).toBe(true);

    world.markForDeletion([entityA]);
    world.flushDeletions();

    expect(world.entityManager.exists(entityA)).toBe(false);
    expect(world.entityManager.exists(entityB)).toBe(true);

    const archetype = world.getEntityArchetype(entityB);
    expect(archetype?.getEntityIndex(entityB)).toBe(0);
    expect(world.getEntityArchetype(entityA)).toBeUndefined();
  });
});
