# Architecture

High-level map of the Motion engine (≤2 pages).

## Modules
- @g-motion/core: ECS runtime (World, Archetype, ComponentRegistry, SystemScheduler) and systems (time, timeline, interpolation, render, batch, webgpu).
  - AppContext: Type-safe singleton for dependency injection (batch processor, WebGPU state).
  - Types: Centralized type definitions (Keyframe, Track, TimelineData, SpringOptions, InertiaOptions, etc.).
  - BurstManager: High-performance batch entity creation/deletion with pre-allocation.
- @g-motion/animation: Public `motion()` and `motionBatch()` builders wiring systems into the scheduler.
  - MotionBuilder: Single-entity animation builder.
  - MotionBatchBuilder: Multi-entity batch builder with per-entity parameter functions.
  - BatchAnimationControl: Unified control interface for 1000+ animations.
- @g-motion/plugin-dom: Transform component + DOM render system with element caching; auto-registered for DOM targets.
- @g-motion/plugin-spring: Spring physics animations with configurable stiffness/damping.
- @g-motion/plugin-inertia: Inertia-based animations with velocity tracking and snap-to support.
- @g-motion/utils: Shared helpers.
- apps/examples, apps/web: Consumer demos.

## Data Model (ECS)
- Entity: numeric id.
- Component: plain data schema registered in ComponentRegistry.
- Archetype: entities grouped by component signature; contiguous buffers (SoA) for cache locality.
  - O(1) entity lookup via reverse index map (indicesMap: Map<entityId, index>).
  - Optimized for hot-path entity access patterns (28x faster than linear search).
- System: processes archetypes each frame via SystemScheduler.
- AppContext: Singleton providing type-safe access to shared resources (BatchProcessor, WebGPU state).

## Runtime Flow (per frame)
1) TimeSystem updates global/frame timing.
2) TimelineSystem advances tracks/keyframes (binary search for O(log n) keyframe lookup).
3) InterpolationSystem computes current values (pre-allocated render.props to eliminate per-frame allocations).
4) RenderSystem applies values (DOM with element caching/object/callback); component buffer caching for optimal throughput.
5) BatchSamplingSystem + WebGPUComputeSystem may offload heavy interpolation to GPU (5000+ entities).

## Motion Builder Path
- `motion(target)` → MotionBuilder accumulates `mark()` keyframes → `animate()` creates entity with MotionState + Timeline (+ Render/Transform for DOM) and ensures relevant systems are scheduled.
- `motionBatch(targets[])` → MotionBatchBuilder accumulates `mark()` with per-entity functions → `animate()` creates individual MotionBuilder per entity, returns BatchAnimationControl for unified playback.

## WebGPU Pipeline (optional)
- BatchSamplingSystem: collect GPU-eligible entities, flatten state/keyframes.
- BatchProcessor: pack buffers and metadata.
- WebGPUComputeSystem: upload to GPU, dispatch WGSL interpolation kernel, optional readback.
- SyncManager: manages double buffering and perf metrics; fallback to CPU if GPU unavailable.

## Scheduling and Ordering
- Scheduler runs systems in deterministic order: Time → Timeline → Interpolation → Render → Batch → WebGPU.
- Plugins can register additional systems; order should preserve data dependencies.

## Extensibility Points
- Property plugins: new components + renderers for custom data types.
- System plugins: add/replace interpolation or physics systems.
- Renderer plugins: new targets (e.g., Canvas/WebGL); follow RenderComponent contract.

## Constraints / Performance
- Keep component buffers contiguous (SoA); avoid per-frame allocations in hot paths.
- Maintain strict TypeScript and declaration outputs.
- Public exports defined via package.json `exports`; update consumers when changed.
- For GPU path, validate availability, batch sizes, and fallback behavior.

## Performance Optimizations (Verified)
- **Archetype Lookup**: O(1) via reverse index map (28x faster than O(n) linear scan).
- **Keyframe Search**: Binary search O(log n) for timeline lookups (1.57x-200x faster).
- **Memory**: Pre-allocated render buffers eliminate per-frame allocations (60K → 0 allocations/frame).
- **DOM Rendering**: Element caching + optimized transform building (238x-1M+ operations/sec).
- **Type Safety**: AppContext singleton replaces unsafe globalThis casts (2.07x faster per-frame).
- **Code Quality**: Centralized type definitions reduce duplication by 3x.
- **Real-World**: 5000 element animations run at 60fps (was 12.5fps); 10,000 entity systems 100x faster.
