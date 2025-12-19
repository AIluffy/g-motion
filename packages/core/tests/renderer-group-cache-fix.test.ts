/**
 * Test for RendererGroupCache "Invalid array length" fix
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RendererGroupCache } from '../src/systems/renderer-group-cache';

describe('RendererGroupCache - Invalid Array Length Fix', () => {
  let cache: RendererGroupCache;

  beforeEach(() => {
    cache = new RendererGroupCache();
  });

  it('should handle zero capacity gracefully', () => {
    expect(() => {
      const group = cache.getOrCreate('archetype-1', 'renderer-1', 0);
      expect(group.capacity).toBeGreaterThan(0);
      expect(group.entityIds).toBeInstanceOf(Int32Array);
      expect(group.targets).toBeInstanceOf(Array);
      expect(group.indices).toBeInstanceOf(Int32Array);
    }).not.toThrow();
  });

  it('should handle negative capacity gracefully', () => {
    expect(() => {
      const group = cache.getOrCreate('archetype-1', 'renderer-1', -10);
      expect(group.capacity).toBeGreaterThan(0);
      expect(group.entityIds).toBeInstanceOf(Int32Array);
    }).not.toThrow();
  });

  it('should handle NaN capacity gracefully', () => {
    expect(() => {
      const group = cache.getOrCreate('archetype-1', 'renderer-1', NaN);
      expect(group.capacity).toBeGreaterThan(0);
      expect(group.entityIds).toBeInstanceOf(Int32Array);
    }).not.toThrow();
  });

  it('should handle fractional capacity by flooring', () => {
    const group = cache.getOrCreate('archetype-1', 'renderer-1', 10.7);
    expect(group.capacity).toBeGreaterThanOrEqual(10);
    expect(Number.isInteger(group.capacity)).toBe(true);
  });

  it('should handle very large capacity by capping', () => {
    expect(() => {
      const group = cache.getOrCreate('archetype-1', 'renderer-1', Number.MAX_SAFE_INTEGER);
      expect(group.capacity).toBeLessThanOrEqual(2147483647);
      expect(group.entityIds).toBeInstanceOf(Int32Array);
    }).not.toThrow();
  });

  it('should grow capacity correctly', () => {
    // Create initial group with capacity 10
    const group1 = cache.getOrCreate('archetype-1', 'renderer-1', 10);
    expect(group1.capacity).toBeGreaterThanOrEqual(10);

    // Request larger capacity
    const group2 = cache.getOrCreate('archetype-1', 'renderer-1', 20);
    expect(group2.capacity).toBeGreaterThanOrEqual(20);
  });

  it('should reject invalid entityId in addEntity', () => {
    const group = cache.getOrCreate('archetype-1', 'renderer-1', 10);

    expect(() => {
      cache.addEntity(group, NaN, {}, 0);
    }).toThrow('Invalid entityId');
  });

  it('should reject invalid index in addEntity', () => {
    const group = cache.getOrCreate('archetype-1', 'renderer-1', 10);

    expect(() => {
      cache.addEntity(group, 1, {}, NaN);
    }).toThrow('Invalid entityId');
  });

  it('should handle normal operation correctly', () => {
    const group = cache.getOrCreate('archetype-1', 'renderer-1', 100);

    // Add entities
    for (let i = 0; i < 50; i++) {
      cache.addEntity(group, i, { id: i }, i);
    }

    expect(group.count).toBe(50);

    // Get active data
    const activeData = cache.getActiveData(group);
    expect(activeData.entityIds.length).toBe(50);
    expect(activeData.targets.length).toBe(50);
    expect(activeData.indices.length).toBe(50);
  });

  it('should reset count on new frame', () => {
    const group = cache.getOrCreate('archetype-1', 'renderer-1', 100);

    // Add entities
    cache.addEntity(group, 1, {}, 0);
    cache.addEntity(group, 2, {}, 1);
    expect(group.count).toBe(2);

    // Get same group again (simulating new frame)
    const group2 = cache.getOrCreate('archetype-1', 'renderer-1', 100);
    expect(group2.count).toBe(0);
    expect(group2).toBe(group); // Same instance
  });

  it('should handle capacity exceeded error with details', () => {
    const group = cache.getOrCreate('archetype-1', 'renderer-1', 2);

    cache.addEntity(group, 1, {}, 0);
    cache.addEntity(group, 2, {}, 1);

    expect(() => {
      cache.addEntity(group, 3, {}, 2);
    }).toThrow(/capacity exceeded.*EntityId: 3.*Index: 2/);
  });
});
