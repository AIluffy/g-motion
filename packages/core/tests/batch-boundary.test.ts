import { describe, it, expect } from 'vitest';
import { ComputeBatchProcessor } from '../src/systems/batch/processor';
import { ErrorCode } from '../src/errors';

describe('ComputeBatchProcessor - boundary cases', () => {
  it('throws when creating legacy batch with zero entities', () => {
    const p = new ComputeBatchProcessor();
    expect(() => p.createBatch('b-empty', [])).toThrow();
  });

  it('throws when adding archetype batch with zero entities', () => {
    const p = new ComputeBatchProcessor();
    expect(() =>
      p.addArchetypeBatch('arch-1', [], new Float32Array(0), new Float32Array(0)),
    ).toThrow();
  });

  it('allows creating batches larger than maxBatchSize (legacy API)', () => {
    const p = new ComputeBatchProcessor({ maxBatchSize: 10 });
    const entities = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      startTime: 0,
      currentTime: 0,
      playbackRate: 1,
      status: 0,
    }));

    const meta = p.createBatch('big', entities as any);
    expect(meta.entityCount).toBe(20);
    expect(p.getBatchSize('big')).toBe(20);
  });

  it('validateBatch returns errors when keyframes missing', () => {
    const p = new ComputeBatchProcessor();
    const entities = [{ id: 1, startTime: 0, currentTime: 0, playbackRate: 1, status: 0 }];
    p.createBatch('b1', entities as any);

    const v = p.validateBatch('b1');
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toContain('Keyframes');
  });
});
