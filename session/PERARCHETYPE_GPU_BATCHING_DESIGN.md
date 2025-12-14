# Per-Archetype GPU Batching Design

**Date**: 2025-12-11
**Goal**: Implement per-archetype segmented buffers with adaptive workgroup sizing and shared buffer pooling.

## Executive Summary

Current GPU compute path:
- Merges all eligible entities into **one flat batch per frame** → 1 dispatch
- Recreates GPU buffers every frame → high CPU↔GPU churn
- Single workgroup size (64) → potential idle threads for small batches

Target architecture:
- **Per-archetype segmented buffers** → multiple dispatches (one per archetype)
- **Shared pooled buffer allocator** → reuse buffers across frames
- **Adaptive workgroup sizing** (16/32/64/128) → precompiled or dynamic pipeline selection
- **Optional per-archetype persistent buffers** for small predictable scenes

Benefits:
1. **Reduced bind-group churn**: Reuse bind groups across frames when archetype entities stable
2. **Better cache locality**: Each dispatch operates on a contiguous archetype's data
3. **Flexible workgroup sizing**: 16-thread groups for small batches, 128 for large
4. **Optional per-archetype persistent buffers**: Simplify small-scene implementation without pooling overhead

---

## Architecture

### 1. Buffer Organization Strategy

#### Option A: Shared Pooled Buffer (Default, Large Scenes)

```
┌─────────────────────────────────────────┐
│      Shared Unified GPU Buffer          │
├─────────────────────────────────────────┤
│  Archetype₁ Segment                    │
│  ├─ Entity States     [off₁, cnt₁)    │
│  ├─ Keyframes        [off₂, cnt₁)    │
│  └─ Output           [off₃, cnt₁)    │
├─────────────────────────────────────────┤
│  Archetype₂ Segment                    │
│  ├─ Entity States     [off₄, cnt₂)    │
│  ├─ Keyframes        [off₅, cnt₂)    │
│  └─ Output           [off₆, cnt₂)    │
└─────────────────────────────────────────┘
```

- **Allocator**: Chunked allocator with free-list or buddy allocation
- **Lifecycle**: Allocate once, reuse across frames (resize if scene grows)
- **Overhead**: Initial allocation + per-frame offset/count updates
- **Trade-off**: Low memory churn, higher CPU cost for allocation tracking

#### Option B: Per-Archetype Persistent Buffers (Small Scenes, Low Overhead)

```
Archetype₁ → [States₁ | Keyframes₁ | Output₁]
Archetype₂ → [States₂ | Keyframes₂ | Output₂]
```

- **Allocator**: One persistent buffer per archetype
- **Lifecycle**: Allocate on first encounter, keep for scene lifetime
- **Overhead**: Minimal per-frame (just resize if entity count changes)
- **Trade-off**: Higher memory footprint if many archetypes, no pooling complexity
- **Selection criteria**: Use if `archetype.entityCount < 100` and scene is stable

---

### 2. Batch Processor (Extended)

```typescript
class ArchetypeSegmentedBatchProcessor {
  // Per-archetype batch descriptors
  private archetypeBatches: Map<string, ArchetypeBatch> = new Map();

  // Shared buffer pool (chunked allocator) or per-archetype mode toggle
  private bufferPool: ChunkedBufferAllocator | null = null;
  private usePersistentBuffers: boolean = false;

  interface ArchetypeBatch {
    archetypeId: string;
    entityIds: number[];
    entityCount: number;
    states: Float32Array;    // Flat: [st₀, ct₀, pr₀, st₀, st₁, ct₁, ...]
    keyframes: Float32Array; // Flat: [t₀, dur₀, sv₀, ev₀, eid₀, ...]
    outputOffsets: {
      statesOffset: number;
      keyframesOffset: number;
      outputOffset: number;
    };
    // GPU resources
    gpuStates?: GPUBuffer;
    gpuKeyframes?: GPUBuffer;
    gpuOutput?: GPUBuffer;
    bindGroup?: GPUBindGroup;
  }

  // Settings
  maxBatchSize = 1024; // Per archetype
  workgroupHint = 0;   // 0=auto, 16/32/64/128=fixed

  // Methods
  updateBatches(world: World) {
    // Clear previous batch mappings
    this.archetypeBatches.clear();

    // For each archetype:
    for (const archetype of world.getArchetypes()) {
      const batch = this.collectArchetypeBatch(archetype);
      if (batch.entityCount > 0) {
        this.archetypeBatches.set(batch.archetypeId, batch);
      }
    }
  }

  collectArchetypeBatch(archetype: Archetype): ArchetypeBatch {
    // ... collect entities, states, keyframes per archetype
  }

  allocateGPUBuffers(batch: ArchetypeBatch, device: GPUDevice) {
    // Option A: pooled
    if (!this.usePersistentBuffers && this.bufferPool) {
      batch.outputOffsets = this.bufferPool.allocate(
        batch.states.byteLength + batch.keyframes.byteLength + batch.entityCount * 4
      );
    }
    // Option B: persistent
    else {
      // Create or resize batch buffers
    }
  }

  selectWorkgroup(entityCount: number): number {
    // 16 for <64, 32 for <256, 64 for <1k, 128 for >=1k
  }
}
```

---

### 3. Batch Sampling System (Updated)

```typescript
export const BatchSamplingSystem: SystemDef = {
  name: 'BatchSamplingSystem',
  order: 5,

  update() {
    const world = World.get();
    const processor = getAppContext().getBatchProcessor();

    // Segment entities by archetype
    for (const archetype of world.getArchetypes()) {
      const eligible = this.filterEligibleEntities(archetype);
      if (eligible.length === 0) continue;

      // Create per-archetype batch
      processor.addArchetypeBatch(
        archetype.id,
        eligible,
        this.extractStates(eligible),
        this.extractKeyframes(eligible),
      );
    }

    // Notify WebGPUComputeSystem of all pending batches
    getAppContext().updateBatchContext({
      archetypeBatches: processor.getArchetypeBatches(),
    });
  },
};
```

---

### 4. WebGPU Compute System (Multi-Dispatch)

```typescript
export const WebGPUComputeSystem: SystemDef = {
  name: 'WebGPUComputeSystem',
  order: 6,

  async update(_dt: number) {
    // ... init checks ...

    const processor = getAppContext().getBatchProcessor();
    const archetypeBatches = processor.getArchetypeBatches();

    for (const batch of archetypeBatches.values()) {
      // 1. Allocate or reuse GPU buffers
      await this.allocateBuffers(batch, device);

      // 2. Upload data
      this.uploadBatchData(batch, device, queue);

      // 3. Select workgroup size
      const workgroupSize = processor.selectWorkgroup(batch.entityCount);

      // 4. Dispatch (with adaptive workgroup)
      this.dispatchBatch(batch, device, queue, workgroupSize);

      // 5. Record metrics
      recordBatchMetric(batch.archetypeId, batch.entityCount, workgroupSize);
    }
  },
};
```

---

### 5. Workgroup Adaptive Strategy

| Entity Count | Recommended WG | Threads | Saturation |
|--------------|---|---|---|
| 1–63 | 16 | 16 | Low (pad with empty lanes) |
| 64–255 | 32 | 32 | Moderate |
| 256–1023 | 64 | 64 | High |
| 1024+ | 128 | 128 | Max |

**Pipeline compilation strategy:**
- **Option A**: Pre-compile 4 pipelines (WG=16/32/64/128) at init, select at dispatch
- **Option B**: Use dynamic pipeline with `workgroupSize` as shader const (requires specialization)
- **Recommendation**: Option A (precompile 4 pipelines) for simplicity and predictable compile time

---

## Implementation Roadmap

### Phase 1: Core Per-Archetype Infrastructure (Week 1)

1. **Extend BatchProcessor** ([packages/core/src/systems/batch-processor.ts](packages/core/src/systems/batch-processor.ts))
   - Add `ArchetypeBatch` interface
   - Replace single-batch map with per-archetype batches
   - Stub buffer pooling (or start with persistent buffers for MVP)

2. **Update BatchSamplingSystem** ([packages/core/src/systems/batch.ts](packages/core/src/systems/batch.ts))
   - Iterate archetypes instead of flattening all
   - Call `processor.addArchetypeBatch()` per archetype
   - Handle max-batch-size chunking (split large archetypes)

3. **Extend WebGPUComputeSystem** ([packages/core/src/systems/webgpu.ts](packages/core/src/systems/webgpu.ts))
   - Loop over archetype batches
   - Allocate per-batch GPU buffers
   - Dispatch once per batch
   - Record dispatch count and workgroup size metrics

### Phase 2: Adaptive Workgroups (Week 1.5)

4. **Precompile 4 Pipelines** in WebGPU init
   - Build shader variant for each WG size (const declaration or macro)
   - Cache pipelines keyed by WG size

5. **Workgroup Selection Logic**
   - Implement `selectWorkgroup(entityCount)` in BatchProcessor
   - Use table-based or formula-based routing

6. **Dispatch with Workgroup Hint**
   - `dispatchWorkgroups(ceil(entityCount / workgroupSize), 1, 1)`

### Phase 3: Buffer Pooling (Week 2, Optional for MVP)

7. **Chunked Buffer Allocator** ([packages/core/src/webgpu/buffer-pool.ts](packages/core/src/webgpu/buffer-pool.ts) new)
   - Implement free-list or buddy allocator
   - Track allocations and reuse
   - Resize on capacity exceeded

8. **Toggle Persistent vs. Pooled** in BatchProcessor config
   - If `usePersistentBuffers=true`, allocate per-archetype (no pooling)
   - If `usePersistentBuffers=false`, use shared pool

### Phase 4: Result Consumption & Metrics (Week 2.5)

9. **Output Sync** in interpolation system
   - Read GPU results (optional readback for CPU-side entity updates)
   - Or keep GPU-resident if render is GPU-direct

10. **Enhanced Metrics**
    - Track dispatch count, workgroup distribution
    - Monitor buffer utilization (pooled mode)
    - Update [session/BENCHMARK_RESULTS_DETAILED.md](session/BENCHMARK_RESULTS_DETAILED.md)

---

## Type Definitions

```typescript
// packages/core/src/types.ts (extend)

export interface ArchetypeBatchDescriptor {
  archetypeId: string;
  entityCount: number;
  maxBatchSize?: number;
  workgroupHint?: 16 | 32 | 64 | 128; // Recommended workgroup size
  statesData: Float32Array;
  keyframesData: Float32Array;
  entityIds: number[];
  // GPU resources (allocated by WebGPUComputeSystem)
  gpuBuffers?: {
    statesBuffer: GPUBuffer;
    keyframesBuffer: GPUBuffer;
    outputBuffer: GPUBuffer;
  };
  bindGroup?: GPUBindGroup;
}

export interface GPUBatchContextWithArchetypes {
  archetypeBatches: Map<string, ArchetypeBatchDescriptor>;
  timestamp: number;
}
```

---

## Migration Path (Non-Breaking)

1. **Backward compatibility**: Existing `motion(target)` and `motionBatch()` APIs unchanged
2. **Internal refactor**: BatchProcessor → per-archetype internally, but expose same public API
3. **Config flag**: `world.config.gpuBatchMode: 'per-archetype' | 'global'` (default: 'per-archetype' after Phase 2)
4. **Gradual rollout**: Start with persistent buffers (Phase 1–2), add pooling later (Phase 3)

---

## Success Metrics

### Performance Targets
- **Dispatch overhead**: <1 ms for 10 archetypes, each with ≤1k entities
- **Buffer reuse**: ≥80% bind-group reuse across frames (pooled mode)
- **Workgroup efficiency**: ≥70% thread utilization (WG size tuned per batch)
- **Memory**: ≤2× current GPU memory usage (shared pool) or ≤3× (persistent per-archetype)

### Validation
- Benchmark 1k/5k/10k entities across multiple archetypes
- Measure dispatch count, workgroup selections, frame times
- Compare with current global-batch approach
- Document results in [session/BENCHMARK_RESULTS_DETAILED.md](session/BENCHMARK_RESULTS_DETAILED.md)

---

## Open Questions & Notes

1. **Max batch size per archetype**: 1024 or tunable?
2. **Multi-keyframe entities**: Current shader assumes 1 keyframe/entity; plan for future multi-track support?
3. **Result consumption**: Readback all outputs or only dirty entities?
4. **Persistent buffer mode**: Auto-detect based on archetype count/size, or explicit config?
5. **Scheduler interaction**: Does multi-dispatch change frame scheduling? (No—scheduler remains fire-and-forget)

---

## References

- [ARCHITECTURE.md](../ARCHITECTURE.md): ECS and scheduler overview
- [WEBGPU_COMPUTE_SUMMARY.md](./WEBGPU_COMPUTE_SUMMARY.md): Current compute pipeline
- [BENCHMARK_SUITE_COMPLETE.md](./BENCHMARK_SUITE_COMPLETE.md): Performance baselines
