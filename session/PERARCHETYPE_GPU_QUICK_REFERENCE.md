# Per-Archetype GPU Batching: Quick Reference

## TL;DR

**What changed:**
- GPU now dispatches **once per archetype** instead of once globally
- Workgroup size automatically **tuned per batch** (16/32/64/128)
- **Backward compatible**—no public API changes

**Key files:**
- [packages/core/src/systems/batch-processor.ts](../packages/core/src/systems/batch-processor.ts): `addArchetypeBatch()`, `selectWorkgroup()`
- [packages/core/src/systems/batch.ts](../packages/core/src/systems/batch.ts): Per-archetype loop + data packing
- [packages/core/src/systems/webgpu.ts](../packages/core/src/systems/webgpu.ts): Multi-dispatch per batch
- [packages/core/src/types.ts](../packages/core/src/types.ts): `ArchetypeBatchDescriptor`

---

## Workgroup Selection Logic

```typescript
selectWorkgroup(entityCount: number): number {
  if (entityCount < 64) return 16;
  if (entityCount < 256) return 32;
  if (entityCount < 1024) return 64;
  return 128;
}
```

**Per-frame output (example):**
```
[Batch] Archetype arch-123: 50 entities, WG hint 16
[Batch] Archetype arch-456: 500 entities, WG hint 32
[Batch] Archetype arch-789: 2000 entities, WG hint 128
[WebGPU] Dispatched 3 archetype batches (3 archetypes)
```

---

## Data Flow

```
Motion State
    ↓
BatchSamplingSystem (order 5)
    ├─ For archetype A: 50 entities
    │   ├─ states: Float32Array(50 * 4)  = [st, ct, pr, s, ...]
    │   ├─ keyframes: Float32Array(...)  = [t, dur, sv, ev, eid, ...]
    │   └─ addArchetypeBatch("A", states, keyframes) → WG hint 16
    ├─ For archetype B: 1000 entities  → WG hint 128
    └─ ...
    ↓
WebGPUComputeSystem (order 6)
    ├─ For batch A:
    │   ├─ Create GPU buffers
    │   ├─ Dispatch: workgroupsX = ceil(50 / 16) = 4
    │   ├─ Metrics: {batchId: "A", entityCount: 50, workgroupSize: 16}
    ├─ For batch B:
    │   ├─ Create GPU buffers
    │   ├─ Dispatch: workgroupsX = ceil(1000 / 128) = 8
    │   ├─ Metrics: {batchId: "B", entityCount: 1000, workgroupSize: 128}
    └─ ...
    ↓
Render System (order 7+)
    └─ CPU-side interpolation still applies
```

---

## Accessing Batch Info

**From processor:**
```typescript
import { getAppContext } from '@g-motion/core';

const processor = getAppContext().getBatchProcessor();

// Get all per-archetype batches (per frame)
const batches = processor.getArchetypeBatches();
for (const [arcId, batch] of batches) {
  console.log(`${arcId}: ${batch.entityCount} entities, WG ${batch.workgroupHint}`);
}

// Stats
const stats = processor.getStats();
console.log(`Total archetypes this frame: ${stats.archetypeCount}`);
console.log(`Total dispatches: ${stats.dispatchCount}`);
```

**From metrics:**
```typescript
import { getGPUMetricsProvider } from '@g-motion/core';

const metrics = getGPUMetricsProvider().getStatus();
// Metrics recorded per dispatch:
// - batchId (archetypeId)
// - entityCount
// - workgroupSize
// - workgroupsX
// - timestamp
```

---

## Common Use Cases

### Case 1: 1k Entities, Single Archetype
```
Input: 1000 entities, archetype "dom-objects"
Output:
  - 1 batch
  - WG = 64
  - Dispatch: ceil(1000 / 64) = 16 workgroups
  - ~0.5–1 ms on typical GPU
```

### Case 2: 5k Entities, 5 Archetypes (1k each)
```
Input: 5 archetypes, 1k entities each
Output:
  - 5 batches
  - 5 dispatches (one per archetype)
  - WG = 64 each
  - Total: 5 × ceil(1000 / 64) = 80 workgroups
  - ~1–2 ms on typical GPU
```

### Case 3: Mixed Batch Sizes
```
Input:
  - Archetype A: 50 entities
  - Archetype B: 500 entities
  - Archetype C: 5000 entities

Output:
  - Batch A: WG = 16, 4 workgroups
  - Batch B: WG = 32, 16 workgroups
  - Batch C: WG = 128, 40 workgroups
  - Total: 60 workgroups, tuned per batch
```

---

## Testing

**Build:**
```bash
pnpm build
```

**Run benchmarks:**
```bash
pnpm bench
# Check dispatch logs + WG selection in console
```

**Validate in examples:**
```bash
cd apps/examples
pnpm dev
# Open devtools, navigate to WebGPU demo
# Inspect console: [Batch] logs + [WebGPU] dispatch summary
```

---

## Configuration

**Current (MVP):**
```typescript
world.config.gpuCompute = 'auto';  // threshold-based, default 1000 entities
world.config.gpuEasing = true;      // enable easing on GPU
```

**Future (Phase 3):**
```typescript
world.config.gpuBatchMode = 'per-archetype';  // 'per-archetype' | 'global'
world.config.gpuBufferMode = 'pooled';        // 'pooled' | 'persistent'
```

---

## Troubleshooting

### "Dispatch count seems low"
Check if threshold is enabled:
```typescript
const status = getGPUMetricsProvider().getStatus();
console.log(`GPU enabled: ${status.enabled}`);
console.log(`Threshold: ${status.gpuThreshold} entities`);
console.log(`Current active: ${status.activeEntityCount}`);
```

### "All batches use WG=64"
Expected for MVP. Phase 5 will precompile 16/32/64/128 pipelines.

### "No per-archetype logs in console"
Add `console.log()` calls in [BatchSamplingSystem](../packages/core/src/systems/batch.ts) or check if GPU is disabled:
```typescript
if (config.gpuCompute === 'never') {
  console.log('GPU compute disabled');
  return;
}
```

---

## References

- **Full Design**: [PERARCHETYPE_GPU_BATCHING_DESIGN.md](./PERARCHETYPE_GPU_BATCHING_DESIGN.md)
- **Implementation Details**: [PERARCHETYPE_GPU_IMPLEMENTATION_SUMMARY.md](./PERARCHETYPE_GPU_IMPLEMENTATION_SUMMARY.md)
- **Architecture**: [../ARCHITECTURE.md](../ARCHITECTURE.md#scheduling-and-ordering)
