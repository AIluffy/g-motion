/**
 * P0 Optimization Tests
 *
 * Validates the performance improvements from P0-1 and P0-2 optimizations:
 * - P0-1: Skip change detection for States data (changes every frame)
 * - P0-2: Use version-based change detection for Keyframes data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PersistentGPUBufferManager } from '../src/webgpu/persistent-buffer-manager';

// Mock GPUBufferUsage constants
(globalThis as any).GPUBufferUsage = {
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  STORAGE: 0x0080,
};

describe('P0 Optimization: Persistent Buffer Manager', () => {
  let mockDevice: any;
  let manager: PersistentGPUBufferManager;

  beforeEach(() => {
    // Mock GPUDevice
    mockDevice = {
      createBuffer: (descriptor: any) => ({
        size: descriptor.size,
        usage: descriptor.usage,
        label: descriptor.label,
        getMappedRange: () => new ArrayBuffer(descriptor.size),
        unmap: () => {},
        destroy: () => {},
      }),
      queue: {
        writeBuffer: () => {},
        submit: () => {},
      },
      createCommandEncoder: () => ({
        copyBufferToBuffer: () => {},
        finish: () => ({}),
      }),
    };

    manager = new PersistentGPUBufferManager(mockDevice);
  });

  describe('P0-1: Skip Change Detection', () => {
    it('should skip change detection when skipChangeDetection=true', () => {
      const data1 = new Float32Array([1, 2, 3, 4]);
      const data2 = new Float32Array([1, 2, 3, 4]); // Same data

      // First upload
      manager.getOrCreateBuffer(
        'states:test',
        data1,
        0x0008 | 0x0004, // STORAGE | COPY_DST
        { skipChangeDetection: true },
      );

      const statsBefore = manager.getStats();

      // Second upload with same data but skipChangeDetection=true
      manager.getOrCreateBuffer('states:test', data2, 0x0008 | 0x0004, {
        skipChangeDetection: true,
      });

      const statsAfter = manager.getStats();

      // Should NOT skip upload (no change detection performed)
      expect(statsAfter.totalUpdates).toBe(statsBefore.totalUpdates + 1);
      expect(statsAfter.bytesSkipped).toBe(statsBefore.bytesSkipped); // No bytes skipped
    });

    it('should detect changes when skipChangeDetection=false', () => {
      const data1 = new Float32Array([1, 2, 3, 4]);
      const data2 = new Float32Array([1, 2, 3, 4]); // Same data

      // First upload
      manager.getOrCreateBuffer('keyframes:test', data1, 0x0008 | 0x0004, {
        skipChangeDetection: false,
      });

      const statsBefore = manager.getStats();

      // Second upload with same data
      manager.getOrCreateBuffer('keyframes:test', data2, 0x0008 | 0x0004, {
        skipChangeDetection: false,
      });

      const statsAfter = manager.getStats();

      // Should skip upload (change detection performed)
      expect(statsAfter.totalUpdates).toBe(statsBefore.totalUpdates);
      expect(statsAfter.bytesSkipped).toBeGreaterThan(statsBefore.bytesSkipped);
    });
  });

  describe('P0-2: Version-based Change Detection', () => {
    it('should skip upload when contentVersion matches', () => {
      const data1 = new Float32Array([1, 2, 3, 4]);
      const data2 = new Float32Array([5, 6, 7, 8]); // Different data
      const version = 123;

      // First upload with version
      manager.getOrCreateBuffer('keyframes:test', data1, 0x0008 | 0x0004, {
        contentVersion: version,
      });

      const statsBefore = manager.getStats();

      // Second upload with DIFFERENT data but SAME version
      manager.getOrCreateBuffer('keyframes:test', data2, 0x0008 | 0x0004, {
        contentVersion: version,
      });

      const statsAfter = manager.getStats();

      // Should skip upload (version matches)
      expect(statsAfter.totalUpdates).toBe(statsBefore.totalUpdates);
      expect(statsAfter.bytesSkipped).toBeGreaterThan(statsBefore.bytesSkipped);
    });

    it('should upload when contentVersion differs', () => {
      const data1 = new Float32Array([1, 2, 3, 4]);
      const data2 = new Float32Array([1, 2, 3, 4]); // Same data
      const version1 = 123;
      const version2 = 456;

      // First upload with version1
      manager.getOrCreateBuffer('keyframes:test', data1, 0x0008 | 0x0004, {
        contentVersion: version1,
      });

      const statsBefore = manager.getStats();

      // Second upload with SAME data but DIFFERENT version
      manager.getOrCreateBuffer('keyframes:test', data2, 0x0008 | 0x0004, {
        contentVersion: version2,
      });

      const statsAfter = manager.getStats();

      // Should upload (version differs)
      expect(statsAfter.totalUpdates).toBe(statsBefore.totalUpdates + 1);
      expect(statsAfter.incrementalUpdates).toBe(statsBefore.incrementalUpdates + 1);
    });

    it('should upload when forceUpdate=true even if contentVersion matches', () => {
      const data1 = new Float32Array([1, 2, 3, 4]);
      const data2 = new Float32Array([5, 6, 7, 8]); // Different data
      const version = 123;

      manager.getOrCreateBuffer('states:test', data1, 0x0008 | 0x0004, {
        contentVersion: version,
      });

      const statsBefore = manager.getStats();

      manager.getOrCreateBuffer('states:test', data2, 0x0008 | 0x0004, {
        contentVersion: version,
        forceUpdate: true,
      });

      const statsAfter = manager.getStats();
      expect(statsAfter.totalUpdates).toBe(statsBefore.totalUpdates + 1);
    });

    it('should track versions per key independently', () => {
      const dataA1 = new Float32Array([1, 2, 3, 4]);
      const dataB1 = new Float32Array([5, 6, 7, 8]);
      const v1 = 1;
      const v2 = 2;

      manager.getOrCreateBuffer('states:a', dataA1, 0x0008 | 0x0004, { contentVersion: v1 });
      manager.getOrCreateBuffer('states:b', dataB1, 0x0008 | 0x0004, { contentVersion: v2 });

      const infoA = manager.getBufferInfo('states:a');
      const infoB = manager.getBufferInfo('states:b');
      expect(infoA?.contentVersion).toBe(v1);
      expect(infoB?.contentVersion).toBe(v2);
    });

    it('skips upload when paused and uploads on seek/resume version bumps', () => {
      const pausedData = new Float32Array([0, 100, 1, 2]);
      const seekedData = new Float32Array([0, 250, 1, 2]);
      const resumedData = new Float32Array([0, 250, 1, 1]);

      manager.getOrCreateBuffer('states:scene', pausedData, 0x0008 | 0x0004, {
        contentVersion: 1,
      });
      const statsAfterFirst = manager.getStats();

      manager.getOrCreateBuffer('states:scene', pausedData, 0x0008 | 0x0004, {
        contentVersion: 1,
      });
      const statsAfterPausedFrame = manager.getStats();
      expect(statsAfterPausedFrame.totalUpdates).toBe(statsAfterFirst.totalUpdates);

      manager.getOrCreateBuffer('states:scene', seekedData, 0x0008 | 0x0004, {
        contentVersion: 2,
      });
      const statsAfterSeek = manager.getStats();
      expect(statsAfterSeek.totalUpdates).toBe(statsAfterPausedFrame.totalUpdates + 1);

      manager.getOrCreateBuffer('states:scene', resumedData, 0x0008 | 0x0004, {
        contentVersion: 3,
      });
      const statsAfterResume = manager.getStats();
      expect(statsAfterResume.totalUpdates).toBe(statsAfterSeek.totalUpdates + 1);
    });

    it('should fallback to element comparison when no version provided', () => {
      const data1 = new Float32Array([1, 2, 3, 4]);
      const data2 = new Float32Array([1, 2, 3, 4]); // Same data

      // First upload without version
      manager.getOrCreateBuffer('keyframes:test', data1, 0x0008 | 0x0004);

      const statsBefore = manager.getStats();

      // Second upload without version
      manager.getOrCreateBuffer('keyframes:test', data2, 0x0008 | 0x0004);

      const statsAfter = manager.getStats();

      // Should skip upload (element comparison detects no change)
      expect(statsAfter.totalUpdates).toBe(statsBefore.totalUpdates);
      expect(statsAfter.bytesSkipped).toBeGreaterThan(statsBefore.bytesSkipped);
    });
  });

  describe('Performance Characteristics', () => {
    it('should demonstrate P0-1 optimization benefit', () => {
      const iterations = 100;
      const data = new Float32Array(5000 * 4); // 5000 entities × 4 fields

      // Simulate States data (changes every frame)
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        // Update currentTime (simulating frame update)
        for (let j = 1; j < data.length; j += 4) {
          data[j] = i * 16.67; // currentTime
        }

        manager.getOrCreateBuffer(
          'states:perf',
          data,
          0x0008 | 0x0004,
          { skipChangeDetection: true }, // P0-1 optimization
        );
      }
      const duration = performance.now() - startTime;

      const stats = manager.getStats();

      // Should upload every frame (no wasted comparisons)
      expect(stats.totalUpdates).toBe(iterations); // Each frame uploads
      expect(stats.bytesSkipped).toBe(0); // No bytes skipped

      console.log(
        `P0-1 Performance: ${iterations} frames in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(3)}ms/frame)`,
      );
    });

    it('tracks current and peak memory usage in stats', () => {
      const data1 = new Float32Array(4);
      const data2 = new Float32Array(8);

      manager.getOrCreateBuffer('mem:a', data1, 0x0008 | 0x0004);
      const firstStats = manager.getStats() as any;
      expect(firstStats.currentMemoryUsage).toBeGreaterThanOrEqual(data1.byteLength);
      const firstPeak = firstStats.peakMemoryUsage;

      manager.getOrCreateBuffer('mem:b', data2, 0x0008 | 0x0004);
      const secondStats = manager.getStats() as any;
      expect(secondStats.currentMemoryUsage).toBeGreaterThanOrEqual(
        data1.byteLength + data2.byteLength,
      );
      expect(secondStats.peakMemoryUsage).toBeGreaterThanOrEqual(firstPeak);
    });

    it('should demonstrate P0-2 optimization benefit', () => {
      const iterations = 100;
      const data = new Float32Array(5000 * 4 * 4 * 5); // 5000 entities × 4 channels × 4 keyframes × 5 fields
      const version = 42; // Static version (keyframes don't change)

      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        manager.getOrCreateBuffer(
          'keyframes:perf',
          data,
          0x0008 | 0x0004,
          { contentVersion: version }, // P0-2 optimization
        );
      }
      const duration = performance.now() - startTime;

      const stats = manager.getStats();

      // Should upload only once (version-based detection)
      expect(stats.totalUpdates).toBe(1); // Only initial upload
      expect(stats.bytesSkipped).toBeGreaterThan(0); // Skipped subsequent uploads

      console.log(
        `P0-2 Performance: ${iterations} frames in ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(3)}ms/frame)`,
      );
      console.log(`P0-2 Bandwidth saved: ${(stats.bytesSkipped / 1024 / 1024).toFixed(2)}MB`);
    });
  });
});
