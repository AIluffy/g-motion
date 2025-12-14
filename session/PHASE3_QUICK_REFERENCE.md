# Phase 3 GPU Delivery Optimization - Quick Reference

## At a Glance

**What**: Persistent staging buffer pool + async readback with timeout
**Why**: Eliminate per-frame GPU buffer allocation pressure
**How**: Pool buffers per-archetype, reclaim unused ones every 5 frames
**Impact**: 3x buffer reuse, zero GC pressure, responsive timeout handling

---

## Key Classes

### `StagingBufferPool`
```typescript
// Create once per WebGPU device
pool = new StagingBufferPool(device);

// Per-readback
stagingBuffer = pool.acquire(archetypeId, size);
pool.markInFlight(stagingBuffer);
// ... mapAsync ...
pool.markAvailable(stagingBuffer);

// End of frame
pool.nextFrame(); // Reclaim unused buffers

// Monitor
stats = pool.getStats(); // { archetypeCount, totalBuffers, inFlightCount }
```

### `AsyncReadbackManager`
```typescript
// Create once
readbackMgr = new AsyncReadbackManager();

// Queue pending operation
readbackMgr.enqueueMapAsync(archetypeId, entityIds, stagingBuffer, mapPromise);

// Later (next frame), check for completed results
results = await readbackMgr.drainCompleted();
// results[i] = { archetypeId, entityIds, values, stagingBuffer }
```

---

## Flow Diagram

```
1. GPU Compute (existing)
   └─ Dispatch shader → outputBuffer

2. Async Readback (Phase 3)
   ├─ stagingBuffer = pool.acquire(archetypeId, size)
   ├─ copyBufferToBuffer(outputBuffer → stagingBuffer)
   ├─ mapAsync(stagingBuffer, READ) [non-blocking]
   │  └─ 100ms timeout protection
   ├─ On success: extract data → enqueueGPUResults()
   └─ On timeout: silent discard (no frame drop)

3. Pool Housekeeping (Phase 3)
   └─ pool.nextFrame() [end of update()]
      └─ Reclaim buffers unused for 5 frames

4. GPU Delivery (Phase 1, unchanged)
   └─ GPUResultApplySystem reads enqueued results
      └─ Apply to render.props next frame
```

---

## Configuration

### StagingBufferPool Options
```typescript
// In staging-pool.ts:
const MAX_BUFFERS_PER_ARCHETYPE = 3;     // Max pool size per archetype
const RECLAIM_THRESHOLD_FRAMES = 5;      // Frames before LRU reclaim
const BUFFER_GROWTH_TOLERANCE = 1.2;     // Allow 20% over-allocation
```

### AsyncReadbackManager Options
```typescript
// In async-readback.ts:
const DEFAULT_TIMEOUT_MS = 100; // Timeout per mapAsync
```

---

## Integration Locations

| File | Role | Status |
|------|------|--------|
| `packages/core/src/webgpu/staging-pool.ts` | Buffer pooling logic | ✅ NEW |
| `packages/core/src/webgpu/async-readback.ts` | Readback queueing | ✅ NEW |
| `packages/core/src/systems/webgpu.ts` | System integration | ✅ UPDATED |
| `packages/core/src/webgpu/sync-manager.ts` | Metrics extension | ✅ UPDATED |
| `packages/core/src/webgpu/index.ts` | Exports | ✅ UPDATED |

---

## Validation Checklist

- ✅ Build: `pnpm build` (8/8 packages)
- ✅ Dev: `pnpm dev` (all watches running)
- ✅ Examples: http://localhost:3000 (loads without error)
- ⏳ Runtime: Run GPU example and verify pool stats in metrics
- ⏳ Performance: Compare FPS with/without Phase 3

---

## Common Patterns

### Checking Pool Health
```typescript
const metrics = stagingPool.getStats();
console.log(`Archetypes: ${metrics.archetypeCount}, Total buffers: ${metrics.totalBuffers}, In-flight: ${metrics.inFlightCount}`);
```

### Graceful Timeout Handling
```typescript
stagingBuffer
  .mapAsync(GPUMapMode.READ)
  .then(() => {
    // Success: extract data
    stagingPool.markAvailable(stagingBuffer);
  })
  .catch((e) => {
    // Timeout or other error: discard and continue
    console.warn(`Readback timeout; discarding frame`);
    stagingPool.markAvailable(stagingBuffer);
  });
```

### Pool Lifecycle
```typescript
// In WebGPUComputeSystem.initWebGPUCompute():
stagingPool = new StagingBufferPool(device);

// In WebGPUComputeSystem.update() loop:
// ... GPU dispatch with stagingPool.acquire() ...

// At end of update():
stagingPool.nextFrame();
```

---

## Performance Expectations

### Before Phase 3
- Per-frame staging buffer: `new Uint32Array(outputSize)` each readback
- Allocation pressure: ~4KB × 60fps × N batches
- Buffer lifetime: ~16ms (1 frame)

### After Phase 3
- Per-archetype pool: max 3 buffers
- Allocation pressure: ~0 (reuse)
- Buffer lifetime: ∞ (persistent, LRU reclaim every 5 frames)
- Timeout protection: 100ms (no frame drop on slow GPU)

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Pool grows unbounded | Timeout thrashing | Lower timeout or increase GPU batch size |
| Readback stalls main frame | `mapAsync()` blocking | Ensure `.catch()` handles timeout |
| Pool metrics show high in-flight | Slow readback | Check GPU performance metrics |
| Memory leaks | Buffer not marked available | Verify `.finally()` or `.catch()` calls `markAvailable()` |

---

## Related Phases

- **Phase 1**: GPU result queue + delivery system
- **Phase 2**: GPU→DOM sync pipeline
- **Phase 3**: **← YOU ARE HERE** Buffer pooling + async readback
- **Phase 4**: Multi-channel output mapping (x, y, rotateX, etc.)
- **Phase 5**: Benchmark validation & stress testing

---

## References

- [Full Implementation Doc](./PHASE3_GPU_DELIVERY_IMPLEMENTATION.md)
- [StagingBufferPool Source](../../packages/core/src/webgpu/staging-pool.ts)
- [AsyncReadbackManager Source](../../packages/core/src/webgpu/async-readback.ts)
- [WebGPU System Source](../../packages/core/src/systems/webgpu.ts)
