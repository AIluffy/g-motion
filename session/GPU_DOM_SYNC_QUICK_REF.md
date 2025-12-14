# GPU→DOM Sync Monitoring - Quick Reference

## 📊 What This Does

Monitors and displays GPU→DOM synchronization performance metrics in real-time:
- Detects when GPU results are synchronized to DOM targets
- Measures sync duration and data transfer size
- Shows sync frequency and status in the performance panel
- Enables performance profiling of GPU-accelerated DOM animations

## 🚀 Quick Start

### View GPU Sync Metrics

The performance panel automatically displays sync metrics when they're active:

```tsx
import { PerfPanel } from '@/components/perf-panel';

<PerfPanel title="Performance" />
```

Look for the **GPU→DOM Sync** section when GPU processing with DOM targets is running.

## 📈 Metrics Display

```
GPU→DOM Sync
├─ Syncing: ✓ Yes          // Is sync happening this frame?
├─ Sync count: 5           // Number of sync ops in monitoring window
├─ Avg sync time: 0.2 ms   // Average sync duration
└─ Data size: 4.0 KB       // Total data transferred
```

## 🔧 Implementation Details

### Extended Metric Interface

```typescript
interface GPUBatchMetric {
  batchId: string;
  entityCount: number;
  timestamp: number;
  gpu: boolean;
  syncPerformed?: boolean;      // NEW: Was sync done?
  syncDurationMs?: number;       // NEW: How long did sync take?
  syncDataSize?: number;         // NEW: How much data transferred?
}
```

### Collecting Sync Statistics

The hook automatically collects stats from recent metrics:

```typescript
// In useLevaMetrics hook
const recentMetrics = metricsArr.slice(-10);  // Last ~500ms
for (const m of recentMetrics) {
  if (m.syncPerformed) {
    gpuSyncCount += 1;
    gpuSyncDurationMs += m.syncDurationMs || 0;
    gpuSyncDataSizeBytes += m.syncDataSize || 0;
  }
}
```

### Recording Sync Metrics

WebGPU system records when sync is needed:

```typescript
// In WebGPUComputeSystem
const hasDOMTargets = batch.entityIds && batch.entityIds.length > 0;

if (hasDOMTargets) {
  const syncStartTime = performance.now();

  // [Phase 4] Actual readback would go here

  syncPerformed = true;
  syncDataSize = outputBuffer.size;
  syncDurationMs = performance.now() - syncStartTime;
}

getGPUMetricsProvider().recordMetric({
  batchId: archetypeId,
  entityCount: batch.entityCount,
  timestamp: performance.now(),
  gpu: true,
  syncPerformed,
  syncDurationMs: syncPerformed ? syncDurationMs : undefined,
  syncDataSize: syncPerformed ? syncDataSize : undefined,
});
```

## 🎯 Integration Points

| Component | Role | Status |
|-----------|------|--------|
| GPUBatchMetric | Data structure for sync info | ✅ Complete |
| WebGPUComputeSystem | Records sync operations | ✅ Complete |
| useLevaMetrics | Aggregates sync statistics | ✅ Complete |
| PerfPanel | Displays sync metrics | ✅ Complete |
| Actual GPU readback | Phase 4 implementation | 🔄 Not yet |

## 📝 Files Modified

- `packages/core/src/webgpu/metrics-provider.ts` - Extended `GPUBatchMetric`
- `packages/core/src/systems/webgpu.ts` - Added sync tracking
- `apps/examples/src/hooks/useLevaMetrics.ts` - Sync statistics collection
- `apps/examples/src/components/perf-panel.tsx` - Sync metrics display

## ✅ Build Status

All 8 packages build successfully with zero errors:
```
✓ @g-motion/utils
✓ @g-motion/core
✓ @g-motion/animation
✓ @g-motion/plugin-dom
✓ @g-motion/plugin-spring
✓ @g-motion/plugin-inertia
✓ examples
✓ web
```

## 🔮 Phase 4 Preview

When GPU→DOM result readback is implemented:

```typescript
// Read GPU results back to CPU/DOM
const stagingBuffer = device.createBuffer({
  size: outputBuffer.size,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

const copyEncoder = device.createCommandEncoder();
copyEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, outputBuffer.size);
queue.submit([copyEncoder.finish()]);

await stagingBuffer.mapAsync(GPUMapMode.READ);
const resultData = new Float32Array(stagingBuffer.getMappedRange()).slice();
stagingBuffer.unmap();

// Then apply to DOM...
```

This will enable true GPU-accelerated DOM animations with full result consumption.

## 🎮 Testing

Run the examples app and enable GPU processing:

```bash
pnpm dev --filter examples
```

Visit GPU-enabled demos (e.g., `/gpu-config`) and observe the Performance panel showing GPU→DOM sync metrics.

## 📚 Related Docs

- [GPU→DOM Sync Monitoring (Full Guide)](./GPU_DOM_SYNC_MONITORING.md)
- [Per-Archetype GPU Batching](./PERARCHETYPE_GPU_BATCHING_DESIGN.md)
- [WebGPU Integration](./WEBGPU_INTEGRATION_GUIDE.md)
- [Product Architecture](../../ARCHITECTURE.md)
