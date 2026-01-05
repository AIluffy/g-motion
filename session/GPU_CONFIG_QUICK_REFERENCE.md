# GPU Compute Configuration - Quick Reference

## TL;DR

Enable fine-grained control over GPU acceleration and easing computation:

```typescript
import { World } from '@g-motion/core';
import { motion } from '@g-motion/animation';

// Option 1: Auto mode (default) - GPU when >= 1000 entities
World.get({ gpuCompute: 'auto' });

// Option 2: Always use GPU
World.get({ gpuCompute: 'always' });

// Option 3: Never use GPU (CPU only)
World.get({ gpuCompute: 'never' });

// Option 4: GPU compute with CPU easing
World.get({ gpuCompute: 'auto', gpuEasing: false });

// Use it transparently - no code changes needed!
motion(target).mark({ to: 100, easing: t => t * t }).animate();
```

## Configuration Options

```typescript
interface MotionAppConfig {
  // When to use GPU ('auto' | 'always' | 'never')
  gpuCompute?: 'auto';        // Default: threshold-based

  // How many entities before GPU kicks in (auto mode only)
  webgpuThreshold?: 1000;     // Default: 1000

  // Run easing on GPU or CPU
  gpuEasing?: true;           // Default: true
}
```

## Use Cases

| Scenario | Config | Why |
|----------|--------|-----|
| Production | `gpuCompute: 'auto'` | Auto-scales with load |
| Testing GPU path | `gpuCompute: 'always'` | Forces GPU usage |
| Mobile/no WebGPU | `gpuCompute: 'never'` | Avoids GPU overhead |
| Debug easing | `gpuCompute: 'auto', gpuEasing: false` | Easing on CPU for debugging |
| Low threshold | `gpuCompute: 'auto', webgpuThreshold: 100` | GPU at 100+ entities |

## Supported Easing Functions (31 total)

### All Common Easings
- **Linear**: linear
- **Power**: quad, cubic, quart, quint (in/out/inout)
- **Trig**: sine, expo, circ (in/out/inout)
- **Advanced**: back, elastic, bounce (in/out/inout)

### Automatic Detection
```typescript
// These work automatically - name matching maps to GPU ID
const easeInQuad = (t) => t * t;
easeInQuad.name = 'easeInQuad';  // Optional, helps detection

motion(target)
  .mark({ to: 100, easing: easeInQuad })  // ID detected as 1
  .animate();
```

### Unsupported Custom Easings
```typescript
const custom = (t) => Math.sin(t * Math.PI);
// Falls back to CPU (gpuEasing=true but not GPU-supported)

motion(target)
  .mark({ to: 100, easing: custom })  // CPU path
  .animate();
```

## Performance Impact

| Scale | Auto Mode Path | GPU Benefit |
|-------|---|---|
| 1-100 entities | CPU | None (overhead avoided) |
| 100-999 entities | CPU | None (overhead avoided) |
| 1000-5000 entities | GPU | 2-5x faster ✅ |
| 5000+ entities | GPU | 5-10x faster ✅ |

## Default Behavior (No Changes Needed)

```typescript
import { motion } from '@g-motion/animation';

// Just use as before - everything works!
motion(0)
  .mark({ to: 100, duration: 500 })
  .animate();

// When you have 1000+ animations:
// ✅ GPU batch processing auto-activates
// ✅ Easing runs on GPU
// ✅ No code changes needed!
```

## Advanced: GPU Status Monitoring

```typescript
import { getGPUBatchStatus, getGPUMetrics } from '@g-motion/animation';

// Check current GPU status
const status = getGPUBatchStatus();
console.log('GPU enabled:', status.enabled);
console.log('Active entities:', status.activeEntityCount);
console.log('Threshold:', status.threshold);

// Get metrics
const metrics = getGPUMetrics();
metrics.forEach(m => {
  console.log(`Batch: ${m.batchId}, GPU: ${m.gpu}, Entities: ${m.entityCount}`);
});
```

## Advanced: GPU Memory Monitoring

```typescript
import { getGPUBatchStatus } from '@g-motion/animation';
import { getGPUMetricsProvider } from '@g-motion/core';

// Read latest memory snapshot from batch status (for UI)
const status = getGPUBatchStatus();
console.log('Current GPU memory (bytes):', status.memoryUsageBytes);
console.log('Peak GPU memory (bytes):', status.peakMemoryUsageBytes);
console.log('Threshold (bytes):', status.memoryUsageThresholdBytes);
console.log('Memory alert active:', status.memoryAlertActive);

// Configure threshold and query history via metrics provider
const provider = getGPUMetricsProvider();

// Set threshold, for example 100MB
provider.updateStatus({
  memoryUsageThresholdBytes: 100 * 1024 * 1024,
});

// Historical snapshots (sampled automatically by the scheduler)
const history = provider.getMemoryHistory?.() ?? [];
history.forEach((snapshot) => {
  console.log(
    new Date(snapshot.timestamp).toISOString(),
    'bytesSkipped=', snapshot.bytesSkipped,
    'processed=', snapshot.totalBytesProcessed,
    'current=', snapshot.currentMemoryUsage,
    'peak=', snapshot.peakMemoryUsage,
  );
});
```

## Backward Compatibility

✅ **No breaking changes**
- Old code works unchanged
- Default behavior optimal for most cases
- Config is optional
- Graceful fallback to CPU when needed

## Common Patterns

### Pattern 1: Explicit GPU Control
```typescript
// Force GPU for consistent performance
World.get({ gpuCompute: 'always' });
```

### Pattern 2: CPU-Only (Mobile)
```typescript
// Pure CPU path
World.get({ gpuCompute: 'never' });
```

### Pattern 3: Custom Threshold
```typescript
// GPU at 500+ entities instead of 1000
World.get({
  gpuCompute: 'auto',
  webgpuThreshold: 500
});
```

### Pattern 4: Debug Mode
```typescript
// GPU interpolation but CPU easing for easier debugging
World.get({
  gpuCompute: 'auto',
  gpuEasing: false
});
```

### Pattern 5: Performance Profile
```typescript
// Adapt to device capability
const isHighEnd = navigator.hardwareConcurrency > 4;
World.get({
  gpuCompute: isHighEnd ? 'auto' : 'never',
  webgpuThreshold: isHighEnd ? 500 : Infinity
});
```

## Troubleshooting

**Q: GPU not being used?**
```typescript
// Check status
const status = getGPUBatchStatus();
console.log('enabled:', status.enabled);
console.log('webgpuAvailable:', status.webgpuAvailable);
console.log('activeEntityCount:', status.activeEntityCount);
console.log('threshold:', status.threshold);
```

**Q: Custom easing ignored on GPU?**
```typescript
// GPU doesn't support custom functions - use 'never' or 'gpuEasing: false'
World.get({ gpuCompute: 'never' });
```

**Q: Performance worse with GPU?**
```typescript
// Might have overhead for very small batches - use default 'auto' mode
World.get({ gpuCompute: 'auto', webgpuThreshold: 1000 });
```

## Summary

- **3 modes**: auto (default), always, never
- **31 easing functions**: All standard easings on GPU
- **Zero overhead**: Smart detection avoids GPU for small batches
- **Backward compatible**: Existing code unchanged
- **Production ready**: Comprehensive error handling and fallbacks
