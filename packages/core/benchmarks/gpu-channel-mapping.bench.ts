import { describe, bench, expect, beforeEach } from 'vitest';
import {
  GPUChannelMappingRegistry,
  createChannelMapping,
  createBatchChannelTable,
} from '../src/webgpu/channel-mapping';
import { clamp01 } from '@g-motion/utils';
import { applyGPUResultPacket } from '../src/systems/webgpu/delivery/apply-results';
import type { ChannelMapping } from '../src/webgpu/channel-mapping';

/**
 * Phase 4 Validation: Multi-Channel GPU Output Mapping
 *
 * Tests:
 * 1. Registry performance (lookup, register, stats)
 * 2. Fallback chain (packet → registry → default)
 * 3. Memory footprint per batch
 * 4. Large-scale batch mapping (1000+ batches)
 * 5. Channel mapping accuracy
 */

describe('Phase 4: Registry Lookup Performance', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Registry lookup: 10K lookups across 100 batches',
    () => {
      // Setup: register 100 batches
      for (let i = 0; i < 100; i++) {
        registry.registerBatchChannels(
          createBatchChannelTable(`batch-${i}`, 5, ['x', 'y', 'scaleX', 'scaleY', 'opacity']),
        );
      }

      // Benchmark: 10K random lookups
      for (let i = 0; i < 10000; i++) {
        const batchId = `batch-${i % 100}`;
        const table = registry.getChannels(batchId);
        expect(table).toBeDefined();
        expect(table?.stride).toBe(5);
      }
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Registration Performance', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Registration performance: 1000 batch registrations',
    () => {
      for (let i = 0; i < 1000; i++) {
        registry.registerBatchChannels(
          createBatchChannelTable(`batch-${i}`, 5, ['x', 'y', 'scaleX', 'scaleY', 'opacity']),
        );
      }

      const stats = registry.getStats();
      expect(stats.registeredBatches).toBe(1000);
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Fallback Performance', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Default fallback: 10K lookups for unregistered batches',
    () => {
      // Setup default channels
      registry.setDefaultChannels(5, [
        createChannelMapping(0, 'x'),
        createChannelMapping(1, 'y'),
        createChannelMapping(2, 'rotateX'),
        createChannelMapping(3, 'rotateY'),
        createChannelMapping(4, 'translateZ'),
      ]);

      // Benchmark: lookup unregistered batches (should use default)
      for (let i = 0; i < 10000; i++) {
        const table = registry.getChannels(`unknown-${i}`);
        expect(table).toBeDefined();
        expect(table?.stride).toBe(5);
      }
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Memory Footprint', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Memory footprint: 1000 batches with 10 channels each',
    () => {
      const properties = [
        'x',
        'y',
        'z',
        'scaleX',
        'scaleY',
        'scaleZ',
        'opacity',
        'rotation',
        'width',
        'height',
      ];

      for (let i = 0; i < 1000; i++) {
        registry.registerBatchChannels(createBatchChannelTable(`batch-${i}`, 10, properties));
      }

      const stats = registry.getStats();
      expect(stats.registeredBatches).toBe(1000);
      expect(stats.totalMappings).toBe(10000);

      // Rough memory estimate: each mapping ~100 bytes (batchId + channels)
      // 1000 batches × 10 channels × 100 bytes ≈ 1MB (acceptable)
    },
    { iterations: 15, time: 500, warmupTime: 100, warmupIterations: 3 },
  );
});

describe('Phase 4: Mapping Accuracy', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Channel mapping accuracy: apply 5K values',
    () => {
      // Simulate GPU output: 1000 entities × 5 channels = 5K values
      const entityCount = 1000;
      const stride = 5;
      const values = new Float32Array(entityCount * stride);

      // Fill with test data
      for (let i = 0; i < entityCount; i++) {
        values[i * stride + 0] = i * 10; // x
        values[i * stride + 1] = i * 20; // y
        values[i * stride + 2] = i * 0.1; // scaleX
        values[i * stride + 3] = i * 0.2; // scaleY
        values[i * stride + 4] = i / 1000; // opacity
      }

      // Get channel mapping
      registry.registerBatchChannels(
        createBatchChannelTable('particles', 5, ['x', 'y', 'scaleX', 'scaleY', 'opacity']),
      );
      const table = registry.getChannels('particles');
      expect(table).toBeDefined();

      // Apply mapping (simulate delivery system)
      const render = { props: {} as Record<string, number> };
      for (let i = 0; i < entityCount; i++) {
        for (const channel of table!.channels) {
          const valueIndex = i * stride + channel.index;
          render.props[channel.property] = values[valueIndex];
        }
      }

      // Verify first entity
      expect(render.props.x).toBe(0);
      expect(render.props.opacity).toBe(0);
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Stats Computation', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Stats computation: 1000 batches',
    () => {
      // Setup
      for (let i = 0; i < 1000; i++) {
        registry.registerBatchChannels(
          createBatchChannelTable(`batch-${i}`, 5, ['x', 'y', 'scaleX', 'scaleY', 'opacity']),
        );
      }

      // Benchmark: compute stats
      for (let i = 0; i < 100; i++) {
        const stats = registry.getStats();
        expect(stats.registeredBatches).toBe(1000);
        expect(stats.totalMappings).toBe(5000);
      }
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Clear Operation', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Clear operation: 1000 batches',
    () => {
      // Setup
      for (let i = 0; i < 1000; i++) {
        registry.registerBatchChannels(
          createBatchChannelTable(`batch-${i}`, 5, ['x', 'y', 'scaleX', 'scaleY', 'opacity']),
        );
      }

      // Benchmark: clear
      registry.clear();
      const stats = registry.getStats();
      expect(stats.registeredBatches).toBe(0);
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Helper Function - createBatchChannelTable', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Helper function performance: createBatchChannelTable',
    () => {
      for (let i = 0; i < 10000; i++) {
        const table = createBatchChannelTable(`batch-${i}`, 5, [
          'x',
          'y',
          'scaleX',
          'scaleY',
          'opacity',
        ]);
        expect(table.channels.length).toBe(5);
      }
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: GPU Result Apply', () => {
  const entityCount = 2000;
  const stride = 4;
  const channelsResolved: ChannelMapping[] = [
    { index: 0, property: 'opacity' },
    { index: 1, property: 'translateX' },
    { index: 2, property: 'translateY' },
    { index: 3, property: 'scaleX' },
  ];

  const entityIds = new Int32Array(entityCount);
  const values = new Float32Array(entityCount * stride);
  for (let i = 0; i < entityCount; i++) {
    entityIds[i] = i;
    const base = i * stride;
    values[base] = (i % 100) / 100;
    values[base + 1] = i * 0.5;
    values[base + 2] = i * 0.25;
    values[base + 3] = 1 + (i % 10) * 0.01;
  }
  const packet = { archetypeId: 'arch', entityIds, values };

  const renderBuffer = Array.from({ length: entityCount }, () => ({
    rendererId: 'dom',
    rendererCode: 0,
    props: {} as Record<string, number>,
    version: 0,
  }));
  const transformBuffer = Array.from({ length: entityCount }, () => ({
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    x: 0,
    y: 0,
  }));
  const indices = new Map<number, number>();
  for (let i = 0; i < entityCount; i++) {
    indices.set(i, i);
  }
  const typedRendererCode = new Int32Array(entityCount);
  const typedTransformX = new Float32Array(entityCount);
  const typedTransformY = new Float32Array(entityCount);
  const typedTransformTranslateX = new Float32Array(entityCount);
  const typedTransformTranslateY = new Float32Array(entityCount);
  const typedTransformScaleX = new Float32Array(entityCount);

  const stableArchetype = {
    id: 'arch',
    getBuffer: (name: string) => {
      if (name === 'Render') return renderBuffer;
      if (name === 'Transform') return transformBuffer;
      return undefined;
    },
    getInternalEntityIndices: () => indices,
    getTypedBuffer: (component: string, field: string) => {
      if (component === 'Render' && field === 'rendererCode') return typedRendererCode;
      if (component === 'Transform' && field === 'x') return typedTransformX;
      if (component === 'Transform' && field === 'y') return typedTransformY;
      if (component === 'Transform' && field === 'translateX') return typedTransformTranslateX;
      if (component === 'Transform' && field === 'translateY') return typedTransformTranslateY;
      if (component === 'Transform' && field === 'scaleX') return typedTransformScaleX;
      return undefined;
    },
  };

  const renderById = new Map<number, any>();
  for (let i = 0; i < entityCount; i++) {
    renderById.set(i, {
      rendererId: 'dom',
      rendererCode: 0,
      props: {} as Record<string, number>,
      version: 0,
    });
  }
  const fallbackArchetype = {
    id: 'other',
    getEntityData: (entityId: number, componentName: string) => {
      if (componentName !== 'Render') return undefined;
      return renderById.get(entityId);
    },
  };

  const worldStable = { getEntityArchetype: () => stableArchetype };
  const worldFallback = { getEntityArchetype: () => fallbackArchetype };

  bench(
    'Apply results: stable archetype path',
    () => {
      applyGPUResultPacket({
        world: worldStable as any,
        packet: packet as any,
        channelsResolved,
        stride,
        primitiveCode: -1,
      });
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );

  bench(
    'Apply results: fallback path',
    () => {
      applyGPUResultPacket({
        world: worldFallback as any,
        packet: packet as any,
        channelsResolved,
        stride,
        primitiveCode: -1,
      });
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Transform Function', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Transform function: 10K value applications',
    () => {
      // Register channel with transform
      registry.registerBatchChannels({
        batchId: 'transformed',
        stride: 3,
        channels: [
          createChannelMapping(0, 'x'),
          createChannelMapping(1, 'y'),
          { index: 2, property: 'opacity', transform: (v: number) => clamp01(v) },
        ],
      });

      const table = registry.getChannels('transformed');
      const values = new Float32Array(3);
      values[0] = 100;
      values[1] = 200;
      values[2] = 1.5; // out of range, should be clamped

      // Apply transform 10K times
      const render = { props: {} as Record<string, number> };
      for (let i = 0; i < 10000; i++) {
        for (const channel of table!.channels) {
          let value = values[channel.index];
          if (channel.transform) {
            value = channel.transform(value);
          }
          render.props[channel.property] = value;
        }
      }

      expect(render.props.opacity).toBe(1); // clamped
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: Multi-Archetype Stress Test', () => {
  let registry: GPUChannelMappingRegistry;

  beforeEach(() => {
    registry = new GPUChannelMappingRegistry();
  });

  bench(
    'Multi-archetype scenario: 10 archetypes, 100 frames',
    () => {
      const archetypes = [
        'particles',
        'ui',
        'effects',
        'text',
        'shapes',
        'sprites',
        'lights',
        'meshes',
        'lines',
        'polygons',
      ];

      // Register different channel layouts per archetype
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[0], 5, ['x', 'y', 'scaleX', 'scaleY', 'opacity']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[1], 4, ['x', 'y', 'width', 'height']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[2], 3, ['x', 'y', 'rotation']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[3], 2, ['fontSize', 'opacity']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[4], 6, [
          'x',
          'y',
          'width',
          'height',
          'rotation',
          'opacity',
        ]),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[5], 4, ['x', 'y', 'scaleX', 'scaleY']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[6], 3, ['intensity', 'radius', 'falloff']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[7], 5, ['x', 'y', 'z', 'rotateX', 'rotateY']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[8], 2, ['strokeWidth', 'opacity']),
      );
      registry.registerBatchChannels(
        createBatchChannelTable(archetypes[9], 4, ['vertices', 'rotation', 'scaleX', 'scaleY']),
      );

      // Simulate 100 frames with random archetype lookups
      for (let frame = 0; frame < 100; frame++) {
        for (let i = 0; i < archetypes.length; i++) {
          const table = registry.getChannels(archetypes[i]);
          expect(table).toBeDefined();
        }
      }

      const stats = registry.getStats();
      expect(stats.registeredBatches).toBe(10);
    },
    { iterations: 20, time: 500, warmupTime: 100, warmupIterations: 5 },
  );
});

describe('Phase 4: OutputFormat and standard transform mapping benchmarks', () => {
  bench(
    'Standard transform mapping: 10K entities × 6 channels',
    () => {
      const registry = new GPUChannelMappingRegistry();
      registry.registerBatchChannels(
        createBatchChannelTable('standard-transform', 6, [
          'x',
          'y',
          'rotate',
          'scaleX',
          'scaleY',
          'opacity',
        ]),
      );
      const table = registry.getChannels('standard-transform');
      expect(table).toBeDefined();

      const entityCount = 10000;
      const stride = table!.stride;
      const values = new Float32Array(entityCount * stride);
      for (let i = 0; i < entityCount; i++) {
        const base = i * stride;
        values[base + 0] = i;
        values[base + 1] = i * 2;
        values[base + 2] = i * 0.5;
        values[base + 3] = 1;
        values[base + 4] = 1;
        values[base + 5] = 1;
      }

      const render = { props: {} as Record<string, number> };
      for (let i = 0; i < entityCount; i++) {
        const base = i * stride;
        for (const channel of table!.channels) {
          render.props[channel.property] = values[base + channel.index];
        }
      }

      expect(render.props.opacity).toBe(1);
    },
    { iterations: 10, time: 300, warmupTime: 100, warmupIterations: 3 },
  );
});
