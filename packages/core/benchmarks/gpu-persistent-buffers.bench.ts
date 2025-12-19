import { describe, bench, beforeEach, afterEach } from 'vitest';
import { PersistentGPUBufferManager } from '../src/webgpu/persistent-buffer-manager';

describe('GPU Persistent Buffer Performance', () => {
  let mockDevice: any;
  let manager: PersistentGPUBufferManager;
  let createdBuffers: any[] = [];

  beforeEach(() => {
    createdBuffers = [];

    // Mock GPUDevice
    mockDevice = {
      createBuffer: (desc: any) => {
        const buffer = {
          size: desc.size,
          usage: desc.usage,
          label: desc.label,
          mappedAtCreation: desc.mappedAtCreation,
          destroyed: false,
          mapState: 'unmapped',
          getMappedRange: () => new ArrayBuffer(desc.size),
          unmap: () => {
            buffer.mapState = 'unmapped';
          },
          destroy: () => {
            buffer.destroyed = true;
          },
        };
        createdBuffers.push(buffer);
        return buffer;
      },
      createCommandEncoder: () => ({
        copyBufferToBuffer: () => {},
        finish: () => ({}),
      }),
      queue: {
        submit: () => {},
        writeBuffer: () => {},
      },
    };

    manager = new PersistentGPUBufferManager(mockDevice);
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('Buffer Creation and Reuse', () => {
    bench('First-time buffer creation (1000 entities)', () => {
      const data = new Float32Array(1000 * 4); // 4 floats per entity
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random();
      }

      manager.getOrCreateBuffer(
        'test:archetype1',
        data,
        3, // STORAGE | COPY_DST
        { label: 'test-buffer' },
      );
    });

    bench('Buffer reuse (no changes, cache hit)', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      // First call creates buffer
      manager.getOrCreateBuffer('test:archetype1', data, 3);

      // Subsequent calls reuse (benchmark this)
      for (let i = 0; i < 100; i++) {
        manager.getOrCreateBuffer('test:archetype1', data, 3);
      }
    });

    bench('Buffer reuse with changes (incremental update)', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      // First call creates buffer
      manager.getOrCreateBuffer('test:archetype1', data, 3);

      // Subsequent calls with changes
      for (let i = 0; i < 100; i++) {
        data[0] = i; // Change one value
        manager.getOrCreateBuffer('test:archetype1', data, 3);
      }
    });
  });

  describe('Incremental Update Detection', () => {
    bench('Change detection (1000 entities, no changes)', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      manager.getOrCreateBuffer('test:archetype1', data, 3);

      // Benchmark change detection
      for (let i = 0; i < 1000; i++) {
        manager.getOrCreateBuffer('test:archetype1', data, 3);
      }
    });

    bench('Change detection (1000 entities, 1% changed)', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      manager.getOrCreateBuffer('test:archetype1', data, 3);

      // Change 1% of data each iteration
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 40; j++) {
          data[j] = Math.random();
        }
        manager.getOrCreateBuffer('test:archetype1', data, 3);
      }
    });

    bench('Change detection (1000 entities, 100% changed)', () => {
      const data = new Float32Array(1000 * 4);

      manager.getOrCreateBuffer('test:archetype1', data, 3);

      // Change all data each iteration
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < data.length; j++) {
          data[j] = Math.random();
        }
        manager.getOrCreateBuffer('test:archetype1', data, 3);
      }
    });
  });

  describe('Multi-Archetype Scenarios', () => {
    bench('10 archetypes, 1000 entities each', () => {
      for (let archIdx = 0; archIdx < 10; archIdx++) {
        const data = new Float32Array(1000 * 4);
        for (let i = 0; i < data.length; i++) {
          data[i] = i + archIdx;
        }
        manager.getOrCreateBuffer(`test:archetype${archIdx}`, data, 3);
      }
    });

    bench('10 archetypes, repeated updates (cache efficiency)', () => {
      // Create buffers for 10 archetypes
      const archetypes = Array.from({ length: 10 }, (_, idx) => {
        const data = new Float32Array(1000 * 4);
        for (let i = 0; i < data.length; i++) {
          data[i] = i;
        }
        return { key: `test:archetype${idx}`, data };
      });

      // First pass: create all buffers
      for (const arch of archetypes) {
        manager.getOrCreateBuffer(arch.key, arch.data, 3);
      }

      // Benchmark: update all buffers (should hit cache)
      for (let frame = 0; frame < 10; frame++) {
        for (const arch of archetypes) {
          manager.getOrCreateBuffer(arch.key, arch.data, 3);
        }
      }
    });
  });

  describe('Buffer Growth', () => {
    bench('Buffer growth (1000 → 2000 entities)', () => {
      const data1000 = new Float32Array(1000 * 4);
      const data2000 = new Float32Array(2000 * 4);

      for (let i = 0; i < data1000.length; i++) {
        data1000[i] = i;
      }
      for (let i = 0; i < data2000.length; i++) {
        data2000[i] = i;
      }

      // Create with 1000 entities
      manager.getOrCreateBuffer('test:growing', data1000, 3, {
        allowGrowth: true,
      });

      // Grow to 2000 entities
      manager.getOrCreateBuffer('test:growing', data2000, 3, {
        allowGrowth: true,
      });
    });

    bench('Buffer growth (10 iterations, +100 entities each)', () => {
      for (let i = 1; i <= 10; i++) {
        const size = i * 100 * 4;
        const data = new Float32Array(size);
        for (let j = 0; j < data.length; j++) {
          data[j] = j;
        }
        manager.getOrCreateBuffer('test:growing', data, 3, {
          allowGrowth: true,
        });
      }
    });
  });

  describe('Memory Efficiency', () => {
    bench('Zero allocation after warmup (1000 updates)', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      // Warmup
      manager.getOrCreateBuffer('test:archetype1', data, 3);

      // Benchmark: should have zero buffer allocations
      for (let i = 0; i < 1000; i++) {
        manager.getOrCreateBuffer('test:archetype1', data, 3);
      }
    });

    bench('Partial updates (only 10% of buffer)', () => {
      const data = new Float32Array(10000 * 4); // Large buffer
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      manager.getOrCreateBuffer('test:large', data, 3);

      // Update only first 10% of data
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 4000; j++) {
          data[j] = Math.random();
        }
        manager.updateBuffer('test:large', data);
      }
    });
  });

  describe('Real-world 60fps Scenario', () => {
    bench('5000 entities × 60 frames (GPU accelerated scenario)', () => {
      const data = new Float32Array(5000 * 4);

      // Simulate 60 frames
      for (let frame = 0; frame < 60; frame++) {
        // Simulate time progression (states change)
        for (let i = 0; i < 5000; i++) {
          data[i * 4 + 1] = frame * 16.67; // currentTime
        }

        manager.getOrCreateBuffer('test:states', data, 3);
        manager.nextFrame();
      }
    });

    bench('5000 entities × 60 frames with static keyframes (optimal case)', () => {
      const statesData = new Float32Array(5000 * 4);
      const keyframesData = new Float32Array(5000 * 4 * 4 * 5); // Static

      // Initialize keyframes once
      for (let i = 0; i < keyframesData.length; i++) {
        keyframesData[i] = i;
      }

      // Simulate 60 frames
      for (let frame = 0; frame < 60; frame++) {
        // States change every frame
        for (let i = 0; i < 5000; i++) {
          statesData[i * 4 + 1] = frame * 16.67;
        }

        // States buffer updates every frame
        manager.getOrCreateBuffer('test:states', statesData, 3);

        // Keyframes buffer should be cached (no upload)
        manager.getOrCreateBuffer('test:keyframes', keyframesData, 3);

        manager.nextFrame();
      }
    });
  });

  describe('Performance Regression Test', () => {
    bench('Baseline: GPU buffer creation without persistence', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random();
      }

      // Simulate old approach: create and destroy every time
      for (let i = 0; i < 100; i++) {
        const buffer = mockDevice.createBuffer({
          size: data.byteLength,
          usage: 3,
          mappedAtCreation: true,
        });
        new Float32Array(buffer.getMappedRange()).set(data);
        buffer.unmap();
        buffer.destroy();
      }
    });

    bench('Optimized: GPU buffer with persistence', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      // First call creates buffer
      manager.getOrCreateBuffer('test:persistent', data, 3);

      // Subsequent 99 calls reuse
      for (let i = 0; i < 99; i++) {
        data[0] = i; // Small change
        manager.getOrCreateBuffer('test:persistent', data, 3);
      }
    });
  });

  describe('Statistics and Monitoring', () => {
    bench('Stats collection overhead', () => {
      const data = new Float32Array(1000 * 4);
      for (let i = 0; i < data.length; i++) {
        data[i] = i;
      }

      for (let i = 0; i < 1000; i++) {
        manager.getOrCreateBuffer('test:stats', data, 3);
        manager.getStats(); // Check stats overhead
      }
    });
  });
});

describe('GPU Persistent Buffer - Comparison Metrics', () => {
  let mockDevice: any;
  let manager: PersistentGPUBufferManager;

  beforeEach(() => {
    mockDevice = {
      createBuffer: (desc: any) => ({
        size: desc.size,
        usage: desc.usage,
        label: desc.label,
        mappedAtCreation: desc.mappedAtCreation,
        destroyed: false,
        getMappedRange: () => new ArrayBuffer(desc.size),
        unmap: () => {},
        destroy: () => {},
      }),
      createCommandEncoder: () => ({
        copyBufferToBuffer: () => {},
        finish: () => ({}),
      }),
      queue: {
        submit: () => {},
        writeBuffer: () => {},
      },
    };

    manager = new PersistentGPUBufferManager(mockDevice);
  });

  afterEach(() => {
    manager.dispose();
  });

  bench('Old approach: Create + destroy 1000 times', () => {
    const data = new Float32Array(1000 * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = i;
    }

    for (let i = 0; i < 1000; i++) {
      const buffer = mockDevice.createBuffer({
        size: data.byteLength,
        usage: 3,
        mappedAtCreation: true,
      });
      new Float32Array(buffer.getMappedRange()).set(data);
      buffer.unmap();
      buffer.destroy();
    }
  });

  bench('New approach: Persistent buffer 1000 updates', () => {
    const data = new Float32Array(1000 * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = i;
    }

    // Create once
    manager.getOrCreateBuffer('test:persistent', data, 3);

    // Update 999 times (with cache)
    for (let i = 0; i < 999; i++) {
      manager.getOrCreateBuffer('test:persistent', data, 3);
    }
  });

  bench('New approach: Persistent buffer 1000 updates (with changes)', () => {
    const data = new Float32Array(1000 * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = i;
    }

    // Create once
    manager.getOrCreateBuffer('test:persistent', data, 3);

    // Update 999 times (with changes)
    for (let i = 0; i < 999; i++) {
      data[0] = i; // Trigger upload
      manager.getOrCreateBuffer('test:persistent', data, 3);
    }
  });
});
