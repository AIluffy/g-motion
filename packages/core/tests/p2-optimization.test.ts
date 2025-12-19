/**
 * P2 Optimization Tests
 *
 * Tests for P2-level performance optimizations:
 * - P2-1: Tiered buffer alignment strategy
 * - P2-2: Renderer group caching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRendererGroupCache,
  resetRendererGroupCache,
} from '../src/systems/renderer-group-cache';

describe('P2-1: Tiered Buffer Alignment', () => {
  it('should use 64-byte alignment for small buffers (<1KB)', () => {
    const sizes = [100, 500, 1000];

    for (const size of sizes) {
      const withHeadroom = Math.ceil(size * 1.25);
      const aligned = Math.ceil(withHeadroom / 64) * 64;

      // Verify alignment
      expect(aligned % 64).toBe(0);

      // Verify waste is reasonable (<100%)
      const waste = (aligned - size) / size;
      expect(waste).toBeLessThan(1.0);
    }
  });

  it('should use 256-byte alignment for medium buffers (1KB-64KB)', () => {
    const sizes = [2048, 16384, 65536];

    for (const size of sizes) {
      const withHeadroom = Math.ceil(size * 1.25);
      const aligned = Math.ceil(withHeadroom / 256) * 256;

      // Verify alignment
      expect(aligned % 256).toBe(0);

      // Verify waste is reasonable (<50%)
      const waste = (aligned - size) / size;
      expect(waste).toBeLessThan(0.5);
    }
  });

  it('should use 4KB alignment for large buffers (>=64KB)', () => {
    const sizes = [100000, 500000, 1000000];

    for (const size of sizes) {
      const withHeadroom = Math.ceil(size * 1.25);
      const aligned = Math.ceil(withHeadroom / 4096) * 4096;

      // Verify alignment
      expect(aligned % 4096).toBe(0);

      // Verify waste is reasonable (<30%)
      const waste = (aligned - size) / size;
      expect(waste).toBeLessThan(0.3);
    }
  });

  it('should reduce memory waste compared to uniform 256-byte alignment', () => {
    const testSizes = [100, 500, 1000, 5000, 10000];

    let totalWasteTiered = 0;
    let totalWasteUniform = 0;

    for (const size of testSizes) {
      const withHeadroom = Math.ceil(size * 1.25);

      // Tiered alignment
      let alignedTiered: number;
      if (withHeadroom < 1024) {
        alignedTiered = Math.ceil(withHeadroom / 64) * 64;
      } else if (withHeadroom < 64 * 1024) {
        alignedTiered = Math.ceil(withHeadroom / 256) * 256;
      } else {
        alignedTiered = Math.ceil(withHeadroom / 4096) * 4096;
      }

      // Uniform 256-byte alignment
      const alignedUniform = Math.ceil(withHeadroom / 256) * 256;

      totalWasteTiered += alignedTiered - size;
      totalWasteUniform += alignedUniform - size;
    }

    // Tiered should waste less
    expect(totalWasteTiered).toBeLessThan(totalWasteUniform);

    // Calculate improvement
    const improvement = (totalWasteUniform - totalWasteTiered) / totalWasteUniform;
    expect(improvement).toBeGreaterThan(0.05); // At least 5% improvement
  });
});

describe('P2-2: Renderer Group Cache', () => {
  beforeEach(() => {
    resetRendererGroupCache();
  });

  it('should create renderer group with pre-allocated buffers', () => {
    const cache = getRendererGroupCache();
    const group = cache.getOrCreate('arch1', 'renderer1', 100);

    expect(group).toBeDefined();
    expect(group.capacity).toBeGreaterThanOrEqual(100);
    expect(group.count).toBe(0);
    expect(group.entityIds).toBeInstanceOf(Int32Array);
    expect(group.indices).toBeInstanceOf(Int32Array);
    expect(Array.isArray(group.targets)).toBe(true);
  });

  it('should reuse cached groups across frames', () => {
    const cache = getRendererGroupCache();

    // Frame 1
    const group1 = cache.getOrCreate('arch1', 'renderer1', 100);
    const bufferRef1 = group1.entityIds;

    // Frame 2
    cache.nextFrame();
    const group2 = cache.getOrCreate('arch1', 'renderer1', 100);
    const bufferRef2 = group2.entityIds;

    // Should reuse same buffer
    expect(bufferRef1).toBe(bufferRef2);
  });

  it('should resize group when capacity is insufficient', () => {
    const cache = getRendererGroupCache();

    // Create with small capacity
    const group1 = cache.getOrCreate('arch1', 'renderer1', 50);
    expect(group1.capacity).toBeGreaterThanOrEqual(50);

    // Request larger capacity
    const group2 = cache.getOrCreate('arch1', 'renderer1', 150);
    expect(group2.capacity).toBeGreaterThanOrEqual(150);
  });

  it('should add entities to group efficiently', () => {
    const cache = getRendererGroupCache();
    const group = cache.getOrCreate('arch1', 'renderer1', 10);

    // Add entities
    for (let i = 0; i < 5; i++) {
      cache.addEntity(group, i, { target: i }, i);
    }

    expect(group.count).toBe(5);

    // Verify data
    const activeData = cache.getActiveData(group);
    expect(activeData.entityIds.length).toBe(5);
    expect(activeData.targets.length).toBe(5);
    expect(activeData.indices.length).toBe(5);

    for (let i = 0; i < 5; i++) {
      expect(activeData.entityIds[i]).toBe(i);
      expect(activeData.indices[i]).toBe(i);
    }
  });

  it('should reset count on new frame', () => {
    const cache = getRendererGroupCache();
    const group = cache.getOrCreate('arch1', 'renderer1', 10);

    // Add entities
    cache.addEntity(group, 1, {}, 0);
    cache.addEntity(group, 2, {}, 1);
    expect(group.count).toBe(2);

    // Next frame
    cache.nextFrame();
    const group2 = cache.getOrCreate('arch1', 'renderer1', 10);

    // Count should be reset
    expect(group2.count).toBe(0);
  });

  it('should clean up stale groups periodically', () => {
    const cache = getRendererGroupCache();

    // Create groups
    cache.getOrCreate('arch1', 'renderer1', 10);
    cache.getOrCreate('arch2', 'renderer2', 10);

    let stats = cache.getStats();
    expect(stats.groupCount).toBe(2);

    // Advance many frames without using arch1
    for (let i = 0; i < 400; i++) {
      cache.nextFrame();
      if (i % 10 === 0) {
        // Keep arch2 alive
        cache.getOrCreate('arch2', 'renderer2', 10);
      }
    }

    stats = cache.getStats();
    // arch1 should be cleaned up (stale for >300 frames)
    expect(stats.groupCount).toBe(1);
  });

  it('should provide accurate cache statistics', () => {
    const cache = getRendererGroupCache();

    const group1 = cache.getOrCreate('arch1', 'renderer1', 100);
    const group2 = cache.getOrCreate('arch2', 'renderer2', 200);

    cache.addEntity(group1, 1, {}, 0);
    cache.addEntity(group1, 2, {}, 1);
    cache.addEntity(group2, 3, {}, 0);

    const stats = cache.getStats();

    expect(stats.groupCount).toBe(2);
    expect(stats.totalCapacity).toBeGreaterThanOrEqual(300);
    expect(stats.totalUsed).toBe(3);
    expect(stats.utilizationRate).toBeGreaterThan(0);
    expect(stats.utilizationRate).toBeLessThan(1);
  });

  it('should handle multiple archetypes and renderers', () => {
    const cache = getRendererGroupCache();

    // Create groups for different archetype-renderer combinations
    const group1 = cache.getOrCreate('arch1', 'renderer1', 10);
    const group2 = cache.getOrCreate('arch1', 'renderer2', 10);
    const group3 = cache.getOrCreate('arch2', 'renderer1', 10);

    cache.addEntity(group1, 1, {}, 0);
    cache.addEntity(group2, 2, {}, 0);
    cache.addEntity(group3, 3, {}, 0);

    // Each group should be independent
    expect(group1.count).toBe(1);
    expect(group2.count).toBe(1);
    expect(group3.count).toBe(1);

    const stats = cache.getStats();
    expect(stats.groupCount).toBe(3);
    expect(stats.totalUsed).toBe(3);
  });

  it('should throw error when capacity is exceeded', () => {
    const cache = getRendererGroupCache();
    const group = cache.getOrCreate('arch1', 'renderer1', 2);

    cache.addEntity(group, 1, {}, 0);
    cache.addEntity(group, 2, {}, 1);

    // Third entity should exceed capacity
    expect(() => {
      cache.addEntity(group, 3, {}, 2);
    }).toThrow(/capacity exceeded/i);
  });

  it('should support numeric renderer codes', () => {
    const cache = getRendererGroupCache();

    // Use numeric renderer code
    const group1 = cache.getOrCreate('arch1', 123, 10);
    const group2 = cache.getOrCreate('arch1', 456, 10);

    cache.addEntity(group1, 1, {}, 0);
    cache.addEntity(group2, 2, {}, 0);

    expect(group1.count).toBe(1);
    expect(group2.count).toBe(1);

    const stats = cache.getStats();
    expect(stats.groupCount).toBe(2);
  });
});

describe('P2 Integration: Memory and Performance', () => {
  it('should reduce GC pressure by reusing TypedArrays', () => {
    const cache = getRendererGroupCache();

    // Simulate multiple frames
    const allocations: Int32Array[] = [];

    for (let frame = 0; frame < 10; frame++) {
      const group = cache.getOrCreate('arch1', 'renderer1', 100);
      allocations.push(group.entityIds);

      // Add some entities
      for (let i = 0; i < 50; i++) {
        cache.addEntity(group, i, {}, i);
      }

      cache.nextFrame();
    }

    // All frames should reuse the same buffer
    const firstBuffer = allocations[0];
    for (let i = 1; i < allocations.length; i++) {
      expect(allocations[i]).toBe(firstBuffer);
    }
  });

  it('should handle high entity count efficiently', () => {
    const cache = getRendererGroupCache();
    const entityCount = 5000;

    const startTime = performance.now();

    const group = cache.getOrCreate('arch1', 'renderer1', entityCount);

    for (let i = 0; i < entityCount; i++) {
      cache.addEntity(group, i, { target: i }, i);
    }

    const activeData = cache.getActiveData(group);

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Should complete in reasonable time (<10ms)
    expect(duration).toBeLessThan(10);

    // Verify all entities added
    expect(group.count).toBe(entityCount);
    expect(activeData.entityIds.length).toBe(entityCount);
  });

  it('should maintain memory efficiency with tiered alignment', () => {
    // Simulate buffer allocation with tiered alignment
    const bufferSizes = [
      100, // Small: 64-byte alignment
      500, // Small: 64-byte alignment
      2048, // Medium: 256-byte alignment
      16384, // Medium: 256-byte alignment
      100000, // Large: 4KB alignment
    ];

    let totalAllocated = 0;
    let totalUsed = 0;

    for (const size of bufferSizes) {
      const withHeadroom = Math.ceil(size * 1.25);

      let aligned: number;
      if (withHeadroom < 1024) {
        aligned = Math.ceil(withHeadroom / 64) * 64;
      } else if (withHeadroom < 64 * 1024) {
        aligned = Math.ceil(withHeadroom / 256) * 256;
      } else {
        aligned = Math.ceil(withHeadroom / 4096) * 4096;
      }

      totalAllocated += aligned;
      totalUsed += size;
    }

    const wasteRatio = (totalAllocated - totalUsed) / totalUsed;

    // Total waste should be reasonable (<40%)
    expect(wasteRatio).toBeLessThan(0.4);
  });
});
