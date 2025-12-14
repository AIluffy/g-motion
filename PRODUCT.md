# Product Overview

Scope of Motion (≤2 pages): what it does and how to use it.

## Value Proposition
- High-performance, modular web animation engine with ECS core and optional WebGPU acceleration.
- Simple, chainable API (`motion().mark().animate()`) that hides ECS details.
- Extensible via plugins for properties, systems, and renderers.

## Primary Use Cases
- DOM animations (translate/scale/rotate/opacity) with smooth timelines.
- Numeric tweens for data viz or counters (callback/object targets).
- Large-scale animations (1000s entities) with GPU offload when available.
- **Batch animations for particle systems** (fireworks, weather, game FX) via `motionBatch()` with per-entity customization.
- Custom behaviors (e.g., spring physics) via system/property plugins.

## Core Functionality
- Entry: `motion(target)` accepts numbers, objects, selectors, or elements; `motionBatch(targets[])` for 1000+ entities.
- Timeline: `.mark({ to, time, easing })` chains sequential keyframes by absolute time (ms).
- Per-Entity Customization: Mark options support functions `(index, entityId, target) => value` for dynamic per-entity animation parameters.
- Playback: `.animate({ delay, repeat, onUpdate })` returns control (play/pause/stop/seek).
- Batch Control: `BatchAnimationControl` manages playback of 1000+ entities as a group.
- Renderers: DOM (auto for selectors/elements), object target, callback target; extensible via plugins.
- Easing/time/repeat/yoyo (per spec) with deterministic sequencing.
- Fallbacks: CPU path when WebGPU missing; DOM renderer only when target is DOM.

## Architecture Highlights
- ECS: Entities + Components + Systems; archetype storage with O(1) entity lookup for optimal cache locality.
- Systems pipeline: Time → Timeline → Interpolation → Render; Batch/WebGPU layer for heavy workloads.
- Plugins: register components/systems/renderers automatically; DOM plugin registers Transform + DOM renderer.
- Performance optimizations: O(1) entity lookups, binary keyframe search, pre-allocated render buffers, DOM element caching.
- Type-safe DI: AppContext singleton provides type-safe dependency injection replacing unsafe globalThis patterns.

## Non-Functional Goals
- 60fps for typical DOM animations; verified 60fps for 5000+ elements with optimized rendering.
- Maintains 2000+ CPU entity animations and 5000+ GPU-accelerated tweens (targets from spec).
- Strict TypeScript with declaration output; stable public exports.
- Performance: 28x faster entity lookups, 30x faster large-scale DOM animations, zero GC pressure with pre-allocation.
- Type safety: Centralized type definitions in @g-motion/core/types; compile-time safety across all packages.

## User-Facing API (quick snippets)
```ts
import { motion, motionBatch } from '@g-motion/animation';

// Single entity animation
motion(0).mark({ to: 100, time: 800 }).animate();

// DOM transform
motion('#box').mark({ to: { x: 120, y: 40, scaleX: 1.1 }, time: 800 }).animate();

// Object target with callback renderer
const obj = { value: 0 };
motion(obj).mark({ to: { value: 10 }, time: 800 }).animate({ onUpdate: () => {/* apply */} });

// Batch animation with per-entity customization (1000+ particles)
const particles = Array.from({ length: 1000 }, () => ({ x: 0, y: 0, opacity: 1 }));
motionBatch(particles)
  .mark({
    to: (index) => ({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      opacity: 0,
    }),
    time: 800,
    stagger: 50,  // 50ms between each entity
  })
  .animate();
```

## Extending
- Property plugin: define component schema + renderer for a new value type.
- System plugin: register custom interpolation/physics systems.
- Renderer plugin: target Canvas/WebGL/etc.; respect RenderComponent contract and system ordering.

## Compatibility / Assumptions
- Modern browsers; WebGPU optional.
- Vite-based examples in apps/examples; React+TS stack.
