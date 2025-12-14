import { describe, it, expect, beforeEach } from 'vitest';
import {
  ComputeBatchProcessor,
  BatchEntity,
  BatchKeyframe,
  BatchResult,
} from '../src/systems/batch';

describe('ComputeBatchProcessor', () => {
  let processor: ComputeBatchProcessor;

  beforeEach(() => {
    processor = new ComputeBatchProcessor({
      maxBatchSize: 1024,
      enableResultCaching: true,
    });
  });

  describe('Batch Creation', () => {
    it('should create batch with entities', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
        {
          id: 1,
          startTime: 0,
          currentTime: 50,
          playbackRate: 1,
          status: 1,
        },
      ];

      const metadata = processor.createBatch('batch-1', entities);
      expect(metadata.batchId).toBe('batch-1');
      expect(metadata.entityCount).toBe(2);
      expect(metadata.createdAt).toBeGreaterThan(0);
    });

    it('should reject empty batches', () => {
      expect(() => {
        processor.createBatch('empty-batch', []);
      }).toThrow();
    });

    it('should track batch statistics', () => {
      const entities: BatchEntity[] = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        startTime: 0,
        currentTime: 100,
        playbackRate: 1,
        status: 1,
      }));

      processor.createBatch('batch-1', entities);
      processor.createBatch('batch-2', entities);

      const stats = processor.getStats();
      expect(stats.totalBatches).toBe(2);
      expect(stats.totalEntitiesProcessed).toBe(20);
      expect(stats.averageBatchSize).toBe(10);
    });
  });

  describe('Keyframe Management', () => {
    it('should add keyframes to batch', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];
      const keyframes: BatchKeyframe[] = [
        {
          entityId: 0,
          startTime: 0,
          duration: 1000,
          startValue: 0,
          endValue: 100,
          easingId: 0,
        },
      ];

      processor.createBatch('batch-1', entities);
      const success = processor.addKeyframes('batch-1', keyframes);
      expect(success).toBe(true);
    });

    it('should reject keyframes for non-existent batch', () => {
      const keyframes: BatchKeyframe[] = [];
      const success = processor.addKeyframes('non-existent', keyframes);
      expect(success).toBe(false);
    });
  });

  describe('Buffer Data Generation', () => {
    it('should generate entity buffer data', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
        {
          id: 1,
          startTime: 0,
          currentTime: 50,
          playbackRate: 0.5,
          status: 1,
        },
      ];

      processor.createBatch('batch-1', entities);
      const buffer = processor.getEntityBufferData('batch-1');

      expect(buffer).not.toBeNull();
      expect(buffer?.length).toBe(8); // 2 entities * 4 f32 values
      expect(buffer?.[0]).toBe(0); // startTime[0]
      expect(buffer?.[1]).toBe(100); // currentTime[0]
      expect(buffer?.[2]).toBe(1); // playbackRate[0]
      expect(buffer?.[3]).toBe(1); // status[0]
      expect(buffer?.[5]).toBe(50); // currentTime[1]
    });

    it('should generate keyframe buffer data', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];
      const keyframes: BatchKeyframe[] = [
        {
          entityId: 0,
          startTime: 0,
          duration: 1000,
          startValue: 0,
          endValue: 100,
          easingId: 1,
        },
      ];

      processor.createBatch('batch-1', entities);
      processor.addKeyframes('batch-1', keyframes);
      const buffer = processor.getKeyframeBufferData('batch-1');

      expect(buffer).not.toBeNull();
      expect(buffer?.length).toBe(5); // 1 keyframe * 5 f32 values
      expect(buffer?.[0]).toBe(0); // startTime
      expect(buffer?.[1]).toBe(1000); // duration
      expect(buffer?.[2]).toBe(0); // startValue
      expect(buffer?.[3]).toBe(100); // endValue
      expect(buffer?.[4]).toBe(1); // easingId
    });

    it('should return null for non-existent batch', () => {
      const buffer = processor.getEntityBufferData('non-existent');
      expect(buffer).toBeNull();
    });
  });

  describe('Result Caching', () => {
    it('should cache results', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];
      const results: BatchResult[] = [
        {
          entityId: 0,
          interpolatedValue: 50,
          timestamp: Date.now(),
        },
      ];

      processor.createBatch('batch-1', entities);
      const success = processor.storeResults('batch-1', results);
      expect(success).toBe(true);

      const cached = processor.getResults('batch-1');
      expect(cached).toEqual(results);
    });

    it('should retrieve cached results', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];
      const results: BatchResult[] = [
        {
          entityId: 0,
          interpolatedValue: 75,
          timestamp: Date.now(),
        },
      ];

      processor.createBatch('batch-1', entities);
      processor.storeResults('batch-1', results);

      const stats = processor.getStats();
      expect(stats.totalResultsCached).toBe(1);
    });
  });

  describe('Batch Validation', () => {
    it('should validate complete batch', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];
      const keyframes: BatchKeyframe[] = [
        {
          entityId: 0,
          startTime: 0,
          duration: 1000,
          startValue: 0,
          endValue: 100,
          easingId: 0,
        },
      ];

      processor.createBatch('batch-1', entities);
      processor.addKeyframes('batch-1', keyframes);

      const validation = processor.validateBatch('batch-1');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing keyframes', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];

      processor.createBatch('batch-1', entities);

      const validation = processor.validateBatch('batch-1');
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect entity-keyframe mismatch', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
        {
          id: 1,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];
      const keyframes: BatchKeyframe[] = [
        {
          entityId: 0,
          startTime: 0,
          duration: 1000,
          startValue: 0,
          endValue: 100,
          easingId: 0,
        },
      ];

      processor.createBatch('batch-1', entities);
      processor.addKeyframes('batch-1', keyframes);

      const validation = processor.validateBatch('batch-1');
      expect(validation.valid).toBe(false);
    });
  });

  describe('Batch Lifecycle', () => {
    it('should clear batch', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];

      processor.createBatch('batch-1', entities);
      const cleared = processor.clearBatch('batch-1');
      expect(cleared).toBe(true);

      const size = processor.getBatchSize('batch-1');
      expect(size).toBe(0);
    });

    it('should get all batch IDs', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];

      processor.createBatch('batch-1', entities);
      processor.createBatch('batch-2', entities);

      const ids = processor.getAllBatchIds();
      expect(ids).toContain('batch-1');
      expect(ids).toContain('batch-2');
      expect(ids).toHaveLength(2);
    });

    it('should reset statistics', () => {
      const entities: BatchEntity[] = [
        {
          id: 0,
          startTime: 0,
          currentTime: 100,
          playbackRate: 1,
          status: 1,
        },
      ];

      processor.createBatch('batch-1', entities);
      processor.resetStats();

      const stats = processor.getStats();
      expect(stats.totalBatches).toBe(0);
      expect(stats.totalEntitiesProcessed).toBe(0);
    });
  });
});
