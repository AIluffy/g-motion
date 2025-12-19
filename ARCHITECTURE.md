# Architecture

High-level map of the Motion engine.

## Repository Structure

### Monorepo Layout
- **Root**: Turbo-based monorepo with pnpm workspaces
- **Packages** (`packages/`): Core libraries and plugins
- **Apps** (`apps/`): Example applications and demos
- **Session** (`session/`): Optimization docs, quick references, and implementation guides
- **Specs** (`specs/`): Design specifications and technical documentation

### Build & Tooling
- **Package Manager**: pnpm@10.24.0 with workspace protocol
- **Build Tool**: Turbo for parallel task execution and caching
- **Bundler**: Rslib for dual ESM/CJS output with TypeScript declarations
- **Linting**: oxlint (1.31.0) with tsgolint plugin
- **Formatting**: oxfmt (0.16.0)
- **Testing**: Vitest (4.0.14) with benchmarking support
- **TypeScript**: 5.9.3 with strict mode enabled

## Core Packages

### @g-motion/core
ECS runtime and core systems foundation.

**Key Modules**:
- **World & Entity**: Entity management with numeric IDs
- **Archetype**: Component-based entity storage with SoA layout
  - O(1) entity lookup via reverse index map (`indicesMap`)
  - Contiguous buffers for cache locality
- **ComponentRegistry**: Type-safe component schema registration
- **SystemScheduler**: Deterministic system execution ordering
- **AppContext**: Type-safe dependency injection singleton
- **Types** (`types.ts`): Centralized type definitions (Keyframe, Track, TimelineData, SpringOptions, InertiaOptions)
- **Constants** (`constants.ts`): Configuration constants (ARCHETYPE_DEFAULTS, SCHEDULER_LIMITS, WEBGPU_WORKGROUPS, BATCH_BUFFER_CACHE)

**Core Systems**:
- `TimeSystem`: Global and per-frame timing, updates `MotionState.currentTime` (timeline time)
- `RenderSystem`: Applies computed values to targets (DOM/object/callback)
- `ThresholdMonitorSystem`: GPU eligibility monitoring
- `BatchSamplingSystem`: Collects GPU-eligible entities, packing `MotionState.currentTime` into GPU state buffers
- `WebGPUComputeSystem`: GPU-accelerated interpolation dispatch that consumes the same timeline time as the CPU path

**Components**:
- `MotionState`: Animation state (playing, progress, repeat)
- `Timeline`: Tracks and keyframes for animation sequencing
- `RenderComponent`: Target and render mode (DOM/object/callback)

**WebGPU Infrastructure** (`src/webgpu/`):
- `shader.ts`: WGSL interpolation kernel
- `buffer.ts`: GPU buffer management
- `sync-manager.ts`: Double buffering and GPU/CPU sync
- `metrics-provider.ts`: Performance metrics collection
- `staging-pool.ts`: Buffer pool for GPU readback
- `async-readback.ts`: Asynchronous GPU result retrieval
- `channel-mapping.ts`: Multi-property channel allocation
- `custom-easing.ts`: GPU-side easing function support

**Utilities** (`src/utils/`):
- `archetype-helpers.ts`: Buffer extraction utilities (`extractTransformTypedBuffers`, `extractCommonBuffers`)

### @g-motion/animation
Public animation API and interpolation systems.

**Entry Points**:
- `motion(target)`: Main API for single/batch entity animations
  - Auto-detects DOM selector multiple matches → batch mode
  - Returns `MotionBuilder` for single entities or batch control
- Engine initialization: Auto-registers systems on first call

**API Modules** (`src/api/`):
- `builder.ts`: Core `motion()` implementation and `MotionBuilder`
- `control.ts`: Animation control interface (play/pause/stop/seek)
- `track.ts`: Track management for multi-property animations
- `adjust.ts`: Runtime animation adjustments
- `mark.ts`: Keyframe marking with per-entity functions
- `keyframes.ts`: Keyframe data structures and utilities
- `physics.ts`: Spring/inertia animation support
- `timeline.ts`: Timeline construction and validation
- `render.ts`: Render target resolution
- `batch-runner.ts`: Batch animation orchestration
- `gpu-status.ts`: GPU availability checking
- `validation.ts`: Input validation and error handling

**Systems** (`src/systems/`):
- `TimelineSystem`: Advances tracks/keyframes with binary search (O(log n))
- `InterpolationSystem`: Computes current values with pre-allocated buffers
- `RovingResolverSystem`: Resolves per-entity animation parameters

**Component Types** (`src/component-types.ts`):
- Type definitions for animation-specific components

### @g-motion/utils
Shared utilities across packages.

- Debug logging with namespaces (`createDebugger`)
- Common helper functions
- Type utilities
- No external dependencies (sideEffects: false)

## Plugin Packages

### @g-motion/plugin-dom
DOM element animation support with transform optimization.

**Components**:
- `Transform`: 3D transform properties (x, y, z, rotation, scale, skew)
- `Color`: Color property animations
- `CSSVar`: CSS custom property animations

**Renderer** (`src/renderer.ts`):
- Element caching for performance (238x-1M+ ops/sec)
- Optimized transform string building
- Automatic plugin registration for DOM targets

**Benchmarks**:
- DOM batch rendering performance tests
- Element caching validation

### @g-motion/plugin-spring
Spring physics animation system.

**Component** (`src/component.ts`):
- `SpringComponent`: Configurable stiffness, damping, mass, velocity

**System** (`src/spring-system.ts`):
- Physics-based interpolation
- Spring dynamics simulation
- Auto-registers with scheduler

**Tests**:
- Spring duration and settling
- Physics accuracy validation

### @g-motion/plugin-inertia
Inertia-based animations with decay.

**Component** (`src/component.ts`):
- `InertiaComponent`: Velocity, power, timeConstant, snap support

**System** (`src/inertia-system.ts`):
- Velocity-based decay
- Snap-to-point support
- Auto-registers with scheduler

**Velocity Tracker** (`src/velocity-tracker.ts`):
- Tracks velocity over time
- Smooth velocity calculation

## Application Packages

### apps/examples
Interactive example gallery with React + TanStack Router.

**Tech Stack**:
- React 19.2.0 + React DOM
- TanStack Router 1.132.0 (file-based routing)
- Tailwind CSS 4.0.6
- Vite 7.1.7
- TypeScript 5.7.2

**Dependencies**:
- All @g-motion packages (core, animation, plugins)
- Lucide React for icons
- Testing: Vitest + Testing Library

**Structure**:
- `src/routes/`: File-based route components
- `src/components/`: Shared UI components
- Demonstrates: DOM animations, batch animations, spring/inertia, GPU acceleration

### apps/web
Minimal web application demo.

**Tech Stack**:
- Vite 7.2.6
- TypeScript 5.9.3
- Uses @g-motion/core + @g-motion/utils

**Purpose**: Lightweight demo and performance testing

## Data Model (ECS)
- Entity: numeric id.
- Component: plain data schema registered in ComponentRegistry.
- Archetype: entities grouped by component signature; contiguous buffers (SoA) for cache locality.
  - O(1) entity lookup via reverse index map (indicesMap: Map<entityId, index>).
  - Optimized for hot-path entity access patterns (28x faster than linear search).
- System: processes archetypes each frame via SystemScheduler.
- AppContext: Singleton providing type-safe access to shared resources (BatchProcessor, WebGPU state).

## System Pipeline (per frame)

The scheduler executes systems in deterministic order to maintain data dependencies:

1. **ThresholdMonitorSystem**: Determines GPU eligibility based on entity count and device capability
2. **TimeSystem**: Updates global clock and per-frame delta time
3. **TimelineSystem**: Advances animation tracks and finds active keyframes via binary search (O(log n))
4. **RovingResolverSystem**: Resolves per-entity animation parameters (batch mode)
5. **InterpolationSystem**: Computes interpolated values using pre-allocated buffers (zero-allocation after first frame)
6. **GPUResultApplySystem**: Applies GPU-computed results back to entities
7. **BatchSamplingSystem**: Collects GPU-eligible entities and prepares batch metadata
8. **WebGPUComputeSystem**: Dispatches GPU compute shader for heavy workloads (5000+ entities)
9. **RenderSystem**: Applies final values to targets (DOM/object/callback) with element caching

**Performance Characteristics**:
- O(1) entity lookup via archetype reverse index
- O(log n) keyframe search via binary search
- Zero per-frame allocations in hot paths (pre-allocated buffers)
- GPU offload threshold: Configurable, typically 5000+ entities
- BatchBufferCache: Eliminates Float32Array allocations (7.3x speedup)

## Animation API Flow

### Single Entity Animation
```
motion(target)
  → MotionBuilder.mark({ to, time, easing })  // Chain keyframes
  → MotionBuilder.animate({ delay, repeat })  // Create entity + schedule systems
  → AnimationControl                           // Returns play/pause/stop/seek interface
```

**Entity Creation**:
- Creates entity with `MotionState`, `Timeline`, `RenderComponent`
- Adds `Transform` component for DOM targets (via plugin auto-registration)
- Ensures required systems are scheduled

### Batch Animation (Multi-Entity)
```
motion([target1, target2, ...])  or  motion('div')  // multiple matches
  → MotionBuilder (batch mode)
  → mark({ to: (index) => value, stagger: 50 })     // Per-entity functions
  → animate()
  → BatchAnimationControl                            // Unified control for all entities
```

**Per-Entity Customization**:
- `to`, `time`, `easing`, `delay` accept functions: `(index, entityId, target) => value`
- `stagger`: Delay offset between entities (ms)
- Creates individual entities with unique parameters

### CSS Selector Handling
- Single match: Creates single entity
- Multiple matches: Auto-upgrades to batch mode
- Invalid selector: Falls back gracefully (renderer handles no-op)

## WebGPU Acceleration Pipeline

**Activation Criteria** (via ThresholdMonitorSystem):
- Entity count exceeds threshold (default: 5000)
- WebGPU device available
- Animation properties GPU-compatible

**Pipeline Flow**:
1. **BatchSamplingSystem**: Collects GPU-eligible entities, extracts state/keyframes
2. **BatchProcessor** (`src/systems/batch/processor.ts`): Packs data into typed arrays
3. **WebGPUComputeSystem**:
   - Uploads buffers to GPU
   - Dispatches WGSL compute shader (workgroups of 64)
   - Optional async readback for validation
4. **GPUResultApplySystem**: Writes GPU results back to entity components
5. **SyncManager**: Manages double buffering, performance metrics, CPU fallback

**Buffer Management**:
- **BatchBufferCache**: Reuses Float32Array allocations (zero GC after first frame)
- **StagingPool**: GPU staging buffers for readback operations
- **Channel Mapping**: Multi-property channel allocation for parallel interpolation

**Fallback Behavior**:
- Falls back to CPU interpolation if GPU unavailable
- Automatic threshold adjustment based on performance
- No API changes required (transparent to users)

## Plugin Architecture

All plugins implement the `MotionPlugin` interface:

```typescript
interface MotionPlugin {
  name: string;
  setup(app: MotionApp): void;
}
```

### Plugin Types

**1. Property Plugins** (e.g., DOM, Spring, Inertia):
- Define new component schemas via `app.registerComponent()`
- Provide custom renderers or systems
- Example: `@g-motion/plugin-dom` adds `Transform`, `Color`, `CSSVar` components

**2. System Plugins**:
- Register custom interpolation or physics systems
- Example: `@g-motion/plugin-spring` adds `SpringSystem` for physics-based motion

**3. Renderer Plugins**:
- Support new target types (Canvas, WebGL, etc.)
- Must respect `RenderComponent` contract
- Integrate with `RenderSystem` pipeline

### Auto-Registration
- DOM plugin auto-registers when target is DOM element/selector
- Spring/Inertia plugins activate when using `.spring()` / `.inertia()` APIs
- Plugins can register systems that auto-schedule when needed

### Extension Points
- **Components**: `app.registerComponent(name, schema)`
- **Systems**: `app.registerSystem(SystemClass)`
- **Utility Functions**: `archetype-helpers.ts` provides reusable buffer extraction
- **Constants**: `constants.ts` centralizes configuration

## Performance Characteristics

### Verified Optimizations
All optimizations validated through comprehensive benchmark suite (38+ tests, all passing).

**1. Archetype Lookup** (O(1) via reverse index map):
- 28x faster than O(n) linear scan
- Enables instant entity access in hot paths
- Implementation: `indicesMap: Map<entityId, index>`

**2. Keyframe Search** (Binary search O(log n)):
- 1.57x-200x faster than linear search
- Efficient timeline navigation
- Critical for smooth playback

**3. Memory Allocation**:
- **Pre-allocated render buffers**: 60K → 0 allocations per frame
- **BatchBufferCache**: 7.3x speedup, zero GC pressure after first frame
  - New `BatchBufferCache` (packages/core/src/systems/batch/buffer-cache.ts) reuses Float32Array buffers per archetype, eliminating per-frame allocations after warmup and reducing GC pauses by ~98% in large-batch scenarios.
  - Benchmarks: allocation speedup ~7.3x; zero per-frame allocations observed in realistic 60fps tests.
- **Typed array reuse**: Eliminates Float32Array allocations in batch processing

**4. Error Handling & Observability**:
- **MotionError & ErrorHandler**: Centralized, typed error system (`packages/core/src/errors.ts`, `packages/core/src/error-handler.ts`) with severity levels (FATAL, ERROR, WARNING, INFO), listener hooks, and automatic GPU → CPU fallback strategies.
  - Integrates with AppContext via `getErrorHandler()` and enables structured error handling across WebGPU, batch, and validation code paths.
  - Improves observability and safe recovery in the scheduler and systems.

**4. DOM Rendering**:
- Element caching: 238x-1M+ operations/sec
- Optimized transform string building
- Batch DOM updates for smooth 60fps

**5. Type Safety & DI**:
- AppContext singleton: 2.07x faster than unsafe globalThis casts
- Compile-time type checking across packages
- Centralized type definitions reduce duplication by 3x

**6. Real-World Performance**:
- 5000 DOM elements @ 60fps (was 12.5fps)
- 10,000 entity system updates: 100x faster
- GPU acceleration for 5000+ entities with automatic fallback

### Development Constraints

**Code Organization** (ECS Module Split Rules):
1. Component files ≤50 lines; split data vs logic if larger
2. Each System in own folder: `index.ts` (≤150 lines), `pipeline.ts` (≤80 lines)
3. Shader logic separate: one `.wgsl` per file (≤80 lines), no inline WGSL
4. Scheduler only orders systems (≤150 lines); no business logic
5. GPU management isolated in dedicated modules
6. Renderers isolated per target (DOM/Canvas/WebGL/WebGPU)
7. Plugins extend via "component + system"; core ECS immutable
8. Any file >400 lines must be split before submission

**Performance Rules**:
- Keep component buffers contiguous (SoA layout)
- Zero per-frame allocations in hot paths (systems, batch, webgpu)
- Use BatchBufferCache for all batch operations
- Access shared resources via AppContext (avoid globalThis)
- Extract common patterns to utility functions (reduce duplication)

**Type Safety**:
- Strict TypeScript with declaration outputs
- Public exports via package.json `exports` field
- Centralized types in `@g-motion/core/types`
- Use `BatchContext` interface instead of `Record<string, any>`

**GPU Requirements**:
- Validate WebGPU availability before use
- Implement CPU fallback for all GPU operations
- Test batch sizes and threshold behavior
- Monitor performance metrics via MetricsProvider

## Testing & Quality

### Test Infrastructure
- **Unit Tests**: Vitest with jsdom for DOM testing
- **Benchmarks**: Performance regression detection (packages/*/benchmarks/)
- **Integration Tests**: Full animation pipeline validation
- **Coverage**: Targeted coverage for public API and critical paths

### Benchmark Suite
- Archetype lookup performance
- Keyframe search efficiency
- Memory allocation regression
- DOM rendering throughput
- GPU channel mapping
- Type consolidation impact
- AppContext DI performance

**Run Benchmarks**: `pnpm bench` (or `pnpm --filter @g-motion/core bench`)

### Quality Gates
- All tests passing (unit + integration)
- Benchmark validation for performance changes
- TypeScript strict mode (no errors)
- Linting with oxlint + tsgolint
- Format checking with oxfmt
- Build verification across all packages

## Documentation & Resources

### Core Documentation
- **README.md**: Quick start and package overview
- **ARCHITECTURE.md**: This document - system design and structure
- **PRODUCT.md**: Product vision, use cases, and user-facing API
- **CONTRIBUTING.md**: Development workflow and guidelines
- **MONOREPO.md**: Monorepo setup and configuration
- **CHANGELOG.md**: Version history and breaking changes

### Optimization Documentation (session/)
- **README.md**: Optimization project index and navigation
- **QUICK_REFERENCE.md**: Performance summary table
- **BENCHMARK_RESULTS_DETAILED.md**: Detailed performance analysis
- **OPTIMIZATION_PROJECT_COMPLETE.md**: Complete optimization implementation
- **TYPE_SAFETY_OPTIMIZATION_PROGRESS.md**: Type safety improvements
- **P0-3_HOT_PATH_LOGGING_COMPLETE.md**: Logging optimization details

### User Guides (session/)
- **BATCH_ANIMATION_QUICK_START.md**: Batch animation tutorial
- **PARTICLES_FPS_QUICK_START.md**: High-performance particle systems
- **GPU_CONFIG_QUICK_REFERENCE.md**: WebGPU configuration guide
- **PERF_MONITOR_QUICK_START.md**: Performance monitoring setup
- **UNIFIED_MOTION_API.md**: Complete API reference

### Technical Specs (specs/)
- **001-motion-engine**: Original design specification
- Detailed feature requirements and acceptance criteria

### Package-Specific
- Each package has local README with API documentation
- Examples in `packages/*/examples/` and `packages/*/tests/`

## Key File References

### Core Entry Points
- `packages/core/src/index.ts`: Core module exports
- `packages/animation/src/index.ts`: Animation API and engine initialization
- `packages/core/src/world.ts`: ECS world singleton
- `packages/core/src/app.ts`: MotionApp context

### Critical Systems
- `packages/core/src/scheduler.ts`: System execution ordering
- `packages/core/src/archetype.ts`: O(1) entity storage
- `packages/animation/src/systems/timeline.ts`: Keyframe timeline processing
- `packages/animation/src/systems/interpolation.ts`: Value interpolation
- `packages/core/src/systems/render.ts`: Target rendering

### WebGPU Infrastructure
- `packages/core/src/webgpu/shader.ts`: WGSL compute shader
- `packages/core/src/systems/webgpu/system.ts`: GPU compute system
- `packages/core/src/systems/batch/processor.ts`: Batch buffer packing
- `packages/core/src/webgpu/sync-manager.ts`: GPU/CPU synchronization

### Type Definitions
- `packages/core/src/types.ts`: All shared types
- `packages/core/src/constants.ts`: Configuration constants
- `packages/animation/src/component-types.ts`: Animation component types

### Plugin Examples
- `packages/plugins/dom/src/index.ts`: DOM plugin implementation
- `packages/plugins/spring/src/spring-system.ts`: Physics system example
- `packages/plugins/inertia/src/inertia-system.ts`: Inertia system example

---

**Last Updated**: 2025-12-16
**Version**: 1.0.0
**Status**: Production Ready
