# WebGPU Integration Guide - System Architecture

## Core Integration Points

### 1. Plugin System Integration

**File:** `packages/core/src/webgpu/plugin.ts`

```typescript
export const WebGPUComputePlugin: MotionPlugin = {
  name: 'WebGPUComputePlugin',
  setup(app: MotionApp) {
    // Register batch sampling system (order 5)
    app.registerSystem(BatchSamplingSystem);

    // Register WebGPU compute system (order 6)
    app.registerSystem(WebGPUComputeSystem);
  },
};
```

**Integration:**
- Registers with the Motion app's system scheduler
- Ensures proper execution order (batch → compute)
- Provides graceful fallback when WebGPU unavailable

---

### 2. System Scheduler Integration

**Scheduler Order:**
```
Order 5: BatchSamplingSystem
  ├─ Queries entities with animation state
  ├─ Filters GPU-eligible entities
  ├─ Prepares entity state and keyframe data
  └─ Makes data ready for GPU

Order 6: WebGPUComputeSystem
  ├─ Receives batched data from BatchSamplingSystem
  ├─ Uploads to GPU buffers
  ├─ Dispatches compute shader
  ├─ Tracks performance metrics
  └─ Optionally reads back results
```

**Key Files:**
- `src/systems/batch.ts` - Batch collection logic
- `src/systems/webgpu.ts` - GPU compute execution
- `src/systems/batch-processor.ts` - Batch organization

---

### 3. Component Integration

**Expected Components:**
- `TimelineComponent` - Animation state (startTime, currentTime, playbackRate, status)
- `InterpolationComponent` - Target property information
- Custom `StateComponent` - Entity-specific animation data

**Data Flow:**
```
Entity Components
       ↓
BatchSamplingSystem (queries & prepares)
       ↓
ComputeBatchProcessor (organizes into batches)
       ↓
WebGPUBufferManager (uploads to GPU)
       ↓
WGSL Compute Kernel (interpolates)
       ↓
Results cache or readback to CPU
```

---

## Module Dependencies

### Core Module (`@g-motion/core`)

```
index.ts (exports)
├── export * from './systems/batch'
├── export * from './systems/webgpu'
└── export * from './app'

systems/
├── batch.ts (BatchSamplingSystem)
├── webgpu.ts (WebGPUComputeSystem)
└── batch-processor.ts (ComputeBatchProcessor)

webgpu/
├── plugin.ts (WebGPUComputePlugin)
├── buffer.ts (WebGPUBufferManager)
├── shader.ts (INTERPOLATION_SHADER)
├── shader-interface.ts (ComputeShaderManager)
├── sync-manager.ts (Performance optimization)
└── benchmark.ts (Performance testing)
```

### Test Modules

```
tests/
├── shader-logic.test.ts (30+ shader tests)
├── batch-integration.test.ts (25+ batch tests)
└── performance.test.ts (35+ performance tests)
```

---

## Data Pipeline

### 1. Batch Preparation Phase

**Input:** Entity state from World registry
```typescript
interface Entity {
  id: number;
  startTime: number;
  currentTime: number;
  playbackRate: number;
  status: number;
}
```

**Processing:**
```typescript
// In BatchSamplingSystem.update()
const entities = world.query(hasTimelineComponent);
const batch = processor.createBatch('frame-batch', entities);

// Flatten to GPU format
const entityData = processor.getEntityBufferData('frame-batch');
// Result: Float32Array with packed [startTime, currentTime, playbackRate, status]
```

### 2. GPU Upload Phase

**In WebGPUComputeSystem.update():**
```typescript
// Create GPU buffers
const stateBuffer = bufferManager.createBuffer(
  entityData.byteLength,
  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
);

// Upload data
bufferManager.writeBuffer(stateBuffer, entityData);

// Track metrics
const metrics = bufferManager.getMetrics();
```

### 3. Compute Dispatch Phase

**GPU Execution:**
```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let index = global_id.x;
  // Read states and keyframes
  // Compute interpolated values
  // Write to output buffer
}
```

### 4. Result Readback Phase

**CPU Processing:**
```typescript
// Cache results if needed
processor.storeResults('frame-batch', results);

// Apply results to entities
for (const result of results) {
  world.getEntity(result.entityId)
    .getComponent('InterpolationResult')
    .value = result.interpolatedValue;
}
```

---

## Performance Monitoring

### Metrics Collection

**At Each Level:**

```
BatchSamplingSystem
├─ Entity count processed
├─ GPU-eligible entity count
└─ Data preparation time

WebGPUBufferManager
├─ Buffer allocations
├─ Data transfer size
├─ Dispatch count
├─ Compute time per dispatch
└─ Memory usage

ComputeOrchestrator
├─ Upload bandwidth
├─ Download bandwidth
├─ Cache hit rate
└─ Total pipeline time
```

### Retrieving Metrics

```typescript
// Buffer manager metrics
const bufferMetrics = bufferManager.getMetrics();
console.log(`Dispatch time: ${bufferMetrics.lastDispatchTime}ms`);
console.log(`Buffer memory: ${bufferMetrics.totalBufferMemory} bytes`);

// Sync metrics
const syncMetrics = orchestrator.getSyncManager().getMetrics();
console.log(`Upload bandwidth: ${syncMetrics.uploadBandwidth} MB/s`);

// Full report
const report = orchestrator.generateFullReport();
console.log(report);
```

---

## Configuration & Customization

### ComputeBatchProcessor Configuration

```typescript
const processor = new ComputeBatchProcessor({
  maxBatchSize: 2048,           // Larger batches for better GPU utilization
  enableDataTransferOptimization: true,  // Cache transfers
  enableResultCaching: true     // Store results
});
```

### Performance Profiling

```typescript
const profiler = new PerformanceProfiler();

profiler.mark('frame-start');
// ... animation frame work ...
profiler.mark('batch-end');
profiler.mark('compute-end');

const batchTime = profiler.measure('batch-phase', 'frame-start', 'batch-end');
const computeTime = profiler.measure('compute-phase', 'batch-end', 'compute-end');

console.log(profiler.summary());
```

### Regression Testing

```typescript
const regression = new RegressionTestHarness(0.15); // 15% tolerance

// Set baseline from previous good run
regression.setBaseline('interpolation-compute', 5.2);

// Check current performance
const result = regression.checkRegression('interpolation-compute', 5.8);
if (!result.passed) {
  console.warn(`Performance regression detected: ${result.deltaPercent.toFixed(1)}%`);
}
```

---

## Error Handling & Fallbacks

### WebGPU Unavailability

```typescript
async function initWebGPUCompute() {
  if (!navigator.gpu) {
    console.warn('WebGPU not available, falling back to CPU');
    // BatchSamplingSystem still prepares data
    // WebGPUComputeSystem returns early
    // CPU path handles computation
    return;
  }
  // Normal GPU execution path
}
```

### Batch Validation

```typescript
const validation = processor.validateBatch('batch-id');
if (!validation.valid) {
  console.error('Batch validation failed:', validation.errors);
  // Skip GPU dispatch, use CPU fallback
}
```

---

## Extension Points

### Custom Compute Shaders

```typescript
const customShader = await shaderManager.compileShader({
  name: 'custom-easing',
  code: `
    // Your WGSL code here
    @compute @workgroup_size(64)
    fn main(...) { ... }
  `,
  bindings: [...]
});
```

### Custom Batch Processing

```typescript
class CustomBatchProcessor extends ComputeBatchProcessor {
  override validateBatch(batchId: string) {
    // Custom validation logic
    return super.validateBatch(batchId);
  }
}
```

### Custom Performance Benchmarks

```typescript
const benchmark = new ComputeBenchmark();

// Benchmark specific operation
const result = await benchmark.benchmark('my-operation', async () => {
  // Your operation here
}, { iterations: 20 });

console.log(`Average time: ${result.avgTime.toFixed(2)}ms`);
```

---

## Testing Strategy

### Unit Tests (Shader Logic)
- ✅ Shader code structure validation
- ✅ Easing function correctness
- ✅ Interpolation logic
- ✅ Status handling

### Integration Tests (Batch System)
- ✅ Batch creation and lifecycle
- ✅ Data flattening correctness
- ✅ Result caching
- ✅ Batch validation

### Performance Tests
- ✅ Benchmark execution
- ✅ CPU vs GPU comparison
- ✅ Data transfer profiling
- ✅ Regression detection

### Running Tests

```bash
# All tests
pnpm test

# Core tests
pnpm --filter @g-motion/core test

# Specific test file
pnpm --filter @g-motion/core test shader-logic.test.ts

# With coverage
pnpm test -- --coverage
```

---

## Debugging & Troubleshooting

### Enable Debug Logging

```typescript
// In batch processor
const processor = new ComputeBatchProcessor({...});

// Validate batches before dispatch
const validation = processor.validateBatch('batch-id');
if (!validation.valid) {
  console.error('Batch errors:', validation.errors);
}
```

### Performance Analysis

```typescript
// Get detailed metrics
const metrics = bufferManager.getMetrics();
const bufferStats = bufferManager.getBufferStats();
const report = orchestrator.generateFullReport();

console.log(`Dispatches: ${metrics.dispatchCount}`);
console.log(`Avg dispatch time: ${metrics.averageDispatchTime.toFixed(3)}ms`);
console.log(`Buffer allocations: ${bufferStats.allocationCount}`);
console.log(`Total memory: ${bufferStats.totalMemory / 1024 / 1024}MB`);
```

### GPU Validation

```typescript
// Check device availability
const device = bufferManager.getDevice();
if (!device) {
  console.error('GPU device not initialized');
  // Fall back to CPU
}

// Check shader compilation
if (!shaderManager.getShader('interpolation')) {
  console.error('Shader compilation failed');
}
```

---

## Summary

The WebGPU compute integration provides a seamless, performant extension to Motion's animation engine with:

- **Clean Architecture:** Modular, well-separated concerns
- **Full Observability:** Comprehensive metrics and profiling
- **Robust Testing:** 90+ tests covering shader, batch, and performance
- **Flexible Customization:** Extension points for custom shaders and processors
- **Production Ready:** Error handling, fallbacks, and validation throughout
